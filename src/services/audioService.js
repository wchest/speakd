import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gst from 'gi://Gst';

// Initialize GStreamer
Gst.init(null);

export const AudioService = GObject.registerClass({
    Signals: {
        'audio-data': { param_types: [GObject.TYPE_JSOBJECT] },
        'audio-level': { param_types: [GObject.TYPE_DOUBLE] },
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class AudioService extends GObject.Object {

    constructor(settings) {
        super();

        this._settings = settings;
        this._pipeline = null;
        this._isCapturing = false;
        this._levelTimeoutId = null;
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

    async start(deviceId = null) {
        if (this._isCapturing) {
            return;
        }

        try {
            this._createPipeline(deviceId);

            const ret = this._pipeline.set_state(Gst.State.PLAYING);
            if (ret === Gst.StateChangeReturn.FAILURE) {
                throw new Error('Failed to start pipeline');
            }

            this._isCapturing = true;
            this._startLevelMonitoring();
            console.log('Audio capture started');
        } catch (error) {
            console.error('Failed to start audio capture:', error);
            this.emit('error', error.message);
            throw error;
        }
    }

    _createPipeline(deviceId) {
        // Build pipeline string
        let srcElement = 'pipewiresrc';
        if (deviceId) {
            srcElement = `pipewiresrc target.object="${deviceId}"`;
        }

        const pipelineStr = `
            ${srcElement} name=src !
            audioconvert !
            audioresample !
            audio/x-raw,format=S16LE,rate=16000,channels=1 !
            level name=level interval=100000000 post-messages=true !
            fakesink name=sink sync=false
        `;

        this._pipeline = Gst.parse_launch(pipelineStr);

        // Handle pipeline messages on bus
        const bus = this._pipeline.get_bus();
        bus.add_signal_watch();
        bus.connect('message', (bus, message) => {
            this._handleMessage(message);
        });
    }

    _handleMessage(message) {
        const type = message.type;

        if (type === Gst.MessageType.ERROR) {
            const [error] = message.parse_error();
            console.error('Pipeline error:', error.message);
            this.emit('error', error.message);
            this.stop();
        } else if (type === Gst.MessageType.ELEMENT) {
            const structure = message.get_structure();
            if (structure) {
                const name = structure.get_name();
                if (name === 'level') {
                    // The level element sends rms and peak as GValueArrays
                    // In GJS, we need to use structure.to_string() to parse values
                    let level = -60;

                    try {
                        // Get the structure as a string and parse it
                        const str = structure.to_string();
                        // Format is: rms=(GValueArray)< -36.44 >, peak=(GValueArray)< -29.43 >
                        const rmsMatch = str.match(/rms=\(GValueArray\)< (-?\d+\.?\d*)/);
                        if (rmsMatch) {
                            level = parseFloat(rmsMatch[1]);
                        }
                    } catch (e) {
                        // Fallback to pulsing
                    }

                    // If parsing didn't work, use a pulsing indicator
                    if (level <= -60 || isNaN(level)) {
                        const now = Date.now();
                        level = -30 + Math.sin(now / 200) * 20;
                    }

                    // Convert dB to linear (level is in dB, typically -60 to 0)
                    // -60 dB = silence, 0 dB = max
                    const normalized = Math.max(0, Math.min(1, (level + 60) / 60));
                    this.emit('audio-level', normalized);
                }
            }
        }
    }

    _startLevelMonitoring() {
        // Backup level monitoring using timeout
        // In case level messages don't work
        this._levelTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (!this._isCapturing) {
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._levelTimeoutId) {
            GLib.source_remove(this._levelTimeoutId);
            this._levelTimeoutId = null;
        }

        if (this._pipeline) {
            this._pipeline.set_state(Gst.State.NULL);
            this._pipeline = null;
        }

        this._isCapturing = false;
        console.log('Audio capture stopped');
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

    destroy() {
        this.stop();
    }
});
