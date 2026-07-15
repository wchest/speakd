import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gst from 'gi://Gst';
import GstApp from 'gi://GstApp';

// Initialize GStreamer
Gst.init(null);

export const AudioService = GObject.registerClass({
    Signals: {
        'audio-data': { param_types: [GObject.TYPE_JSOBJECT] },
        'audio-level': { param_types: [GObject.TYPE_DOUBLE] },
        'speech-start': {},
        'speech-end': {},
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class AudioService extends GObject.Object {

    constructor(settings) {
        super();

        this._settings = settings;
        this._pipeline = null;
        this._appsink = null;
        this._isCapturing = false;
        this._flushTimeoutId = null;
        this._audioBuffer = [];

        // VAD state
        this._isSpeaking = false;
        this._silenceStartTime = 0;
        this._preBuffer = [];  // Ring buffer of recent audio for context
        this._preBufferDuration = 500;  // ms of audio to keep before speech starts
        this._preBufferSamples = Math.floor((16000 * this._preBufferDuration) / 1000);
    }

    get vadThreshold() {
        return this._settings?.vadThreshold ?? 0.05;
    }

    get silenceDuration() {
        return this._settings?.silenceDuration ?? 1500;
    }

    getDevices() {
        const devices = [];

        const monitor = new Gst.DeviceMonitor();
        monitor.add_filter('Audio/Source', null);
        monitor.start();

        const deviceList = monitor.get_devices();
        for (let i = 0; i < deviceList.length; i++) {
            const device = deviceList[i];
            const displayName = device.get_display_name();
            const props = device.get_properties();
            const deviceId = props ? (props.get_string('node.name') || displayName) : displayName;

            devices.push({ id: deviceId, name: displayName });
        }

        monitor.stop();
        return devices;
    }

    start(deviceId = null) {
        if (this._isCapturing) {
            return;
        }

        try {
            // Reset VAD state
            this._isSpeaking = false;
            this._silenceStartTime = 0;
            this._preBuffer = [];

            this._createPipeline(deviceId);
            const ret = this._pipeline.set_state(Gst.State.PLAYING);

            if (ret === Gst.StateChangeReturn.FAILURE) {
                throw new Error('Failed to start pipeline');
            }

            this._isCapturing = true;
        } catch (error) {
            console.error('Failed to start audio capture:', error);
            this.emit('error', error.message);
            throw error;
        }
    }

    _createPipeline(deviceId) {
        // Build pulsesrc with optional device property
        let pulsesrcStr = 'pulsesrc do-timestamp=true';
        if (deviceId) {
            // Escape quotes in device ID for safety
            const escapedId = deviceId.replace(/"/g, '\\"');
            pulsesrcStr += ` device="${escapedId}"`;
            console.log('Using audio device:', deviceId);
        } else {
            console.log('Using default audio device');
        }

        // Audio capture pipeline with pulsesrc -> appsink
        const pipelineStr = `
            ${pulsesrcStr} !
            audioconvert !
            audioresample !
            audio/x-raw,format=S16LE,rate=16000,channels=1 !
            appsink name=sink emit-signals=false sync=false max-buffers=0 drop=false
        `;

        this._pipeline = Gst.parse_launch(pipelineStr);

        // Get appsink - no signal needed, we poll with try_pull_sample
        this._appsink = this._pipeline.get_by_name('sink');

        // Timer to poll and flush audio every 50ms
        this._flushTimeoutId = GLib.timeout_add(GLib.PRIORITY_HIGH, 50, () => {
            this._processPendingSamples();
            return this._isCapturing ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });

        // Handle pipeline messages on bus
        const bus = this._pipeline.get_bus();
        bus.add_signal_watch();
        bus.connect('message', (bus, message) => {
            this._handleMessage(message);
        });
    }

    _processPendingSamples() {
        if (!this._appsink || !this._isCapturing) return;

        // Pull all pending samples (non-blocking)
        let sample;
        while ((sample = this._appsink.try_pull_sample(0)) !== null) {
            const buffer = sample.get_buffer();
            if (!buffer) continue;

            const [success, mapInfo] = buffer.map(Gst.MapFlags.READ);
            if (success) {
                const audioData = new Int16Array(mapInfo.data.buffer.slice(
                    mapInfo.data.byteOffset,
                    mapInfo.data.byteOffset + mapInfo.data.byteLength
                ));
                this._audioBuffer.push(audioData);
                buffer.unmap(mapInfo);
            }
        }

        // Process if we have audio
        if (this._audioBuffer.length > 0) {
            const totalLength = this._audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combined = new Int16Array(totalLength);
            let offset = 0;
            for (const chunk of this._audioBuffer) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }
            this._audioBuffer = [];

            // Calculate RMS audio level from samples
            let sumSquares = 0;
            for (let i = 0; i < combined.length; i++) {
                sumSquares += combined[i] * combined[i];
            }
            const rms = Math.sqrt(sumSquares / combined.length);
            // Normalize to 0-1 range (Int16 max is 32767)
            const normalized = Math.min(1, rms / 16384);
            this.emit('audio-level', normalized);

            // VAD logic
            this._processVAD(combined, normalized);
        }
    }

    _processVAD(audioData, level) {
        const threshold = this.vadThreshold;
        const silenceMs = this.silenceDuration;
        const now = GLib.get_monotonic_time() / 1000;  // Convert to ms

        const isSpeech = level > threshold;

        if (isSpeech) {
            if (!this._isSpeaking) {
                // Speech started - emit pre-buffer first for context
                this._isSpeaking = true;
                this._silenceStartTime = 0;
                console.log('Speech started (level:', level.toFixed(3), ')');
                this.emit('speech-start');

                // Send pre-buffer (audio just before speech started)
                if (this._preBuffer.length > 0) {
                    const preBufferTotal = this._preBuffer.reduce((sum, c) => sum + c.length, 0);
                    const preBufferCombined = new Int16Array(preBufferTotal);
                    let off = 0;
                    for (const chunk of this._preBuffer) {
                        preBufferCombined.set(chunk, off);
                        off += chunk.length;
                    }
                    this.emit('audio-data', preBufferCombined);
                    this._preBuffer = [];
                }
            }

            // Send current audio
            this.emit('audio-data', audioData);
            this._silenceStartTime = 0;

        } else {
            // Silence detected
            if (this._isSpeaking) {
                // Still send audio during short silence (for natural pauses)
                this.emit('audio-data', audioData);

                if (this._silenceStartTime === 0) {
                    this._silenceStartTime = now;
                } else if (now - this._silenceStartTime > silenceMs) {
                    // Silence exceeded threshold - speech ended
                    this._isSpeaking = false;
                    console.log('Speech ended after', silenceMs, 'ms silence');
                    this.emit('speech-end');
                }
            } else {
                // Not speaking - add to pre-buffer ring
                this._addToPreBuffer(audioData);
            }
        }
    }

    _addToPreBuffer(audioData) {
        this._preBuffer.push(audioData);

        // Trim pre-buffer to max size
        let totalSamples = this._preBuffer.reduce((sum, c) => sum + c.length, 0);
        while (totalSamples > this._preBufferSamples && this._preBuffer.length > 1) {
            const removed = this._preBuffer.shift();
            totalSamples -= removed.length;
        }
    }

    _handleMessage(message) {
        if (message.type === Gst.MessageType.ERROR) {
            const [error] = message.parse_error();
            console.error('Pipeline error:', error.message);
            this.emit('error', error.message);
            this.stop();
        }
    }

    stop() {
        this._isCapturing = false;

        if (this._flushTimeoutId) {
            GLib.source_remove(this._flushTimeoutId);
            this._flushTimeoutId = null;
        }

        // If we were speaking, emit end
        if (this._isSpeaking) {
            this._isSpeaking = false;
            this.emit('speech-end');
        }

        this._audioBuffer = [];
        this._preBuffer = [];

        if (this._pipeline) {
            this._pipeline.set_state(Gst.State.NULL);
            this._pipeline = null;
        }

        this._appsink = null;
    }

    pause() {
        if (this._pipeline && this._isCapturing) {
            this._pipeline.set_state(Gst.State.PAUSED);
        }
    }

    resume() {
        if (this._pipeline && this._isCapturing) {
            this._pipeline.set_state(Gst.State.PLAYING);
        }
    }

    get isCapturing() {
        return this._isCapturing;
    }

    get isSpeaking() {
        return this._isSpeaking;
    }

    destroy() {
        this.stop();
    }
});
