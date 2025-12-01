import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

export const DeepgramService = GObject.registerClass({
    Signals: {
        'transcript': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN, GObject.TYPE_BOOLEAN]
        },
        'connected': {},
        'disconnected': {},
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class DeepgramService extends GObject.Object {

    constructor(settings) {
        super();

        this._settings = settings;
        this._session = null;
        this._connection = null;
        this._isConnected = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 5;
        this._reconnectTimeoutId = null;
        this._currentTranscript = '';

        // Deepgram configuration
        this._config = {
            model: 'nova-2',
            language: 'en-US',
            smart_format: 'true',
            punctuate: 'true',
            interim_results: 'true',
            endpointing: '300',
            utterance_end_ms: '1000',
            vad_events: 'true',
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
        };
    }

    _buildUrl() {
        // Build query string manually (GJS doesn't have URLSearchParams)
        const params = Object.entries(this._config)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        return `wss://api.deepgram.com/v1/listen?${params}`;
    }

    start() {
        return new Promise((resolve, reject) => {
            const apiKey = this._settings?.apiKey;
            if (!apiKey) {
                this.emit('error', 'No API key configured');
                reject(new Error('No API key configured'));
                return;
            }

            try {
                this._session = new Soup.Session();

                const url = this._buildUrl();
                console.log('Connecting to Deepgram:', url.substring(0, 50) + '...');

                const message = new Soup.Message({
                    method: 'GET',
                    uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
                });

                // Add authorization header
                message.get_request_headers().append('Authorization', `Token ${apiKey}`);

                // Initiate WebSocket connection
                this._session.websocket_connect_async(
                    message,
                    null,  // origin
                    null,  // protocols
                    GLib.PRIORITY_DEFAULT,
                    null,  // cancellable
                    (session, result) => {
                        try {
                            this._connection = session.websocket_connect_finish(result);
                            this._setupConnection();
                            this._isConnected = true;
                            this._reconnectAttempts = 0;
                            console.log('Deepgram connected');
                            this.emit('connected');
                            resolve();
                        } catch (error) {
                            console.error('WebSocket connection failed:', error.message);
                            this.emit('error', `Connection failed: ${error.message}`);
                            this._scheduleReconnect();
                            reject(error);
                        }
                    }
                );
            } catch (error) {
                console.error('Failed to connect to Deepgram:', error);
                this.emit('error', error.message);
                reject(error);
            }
        });
    }

    _setupConnection() {
        if (!this._connection) return;

        this._connection.connect('message', (connection, type, message) => {
            console.log('WebSocket message received, type:', type);
            try {
                // message is a GLib.Bytes
                const bytes = message.get_data();
                console.log('Got bytes:', bytes ? bytes.length : 'null');
                if (bytes && type === Soup.WebsocketDataType.TEXT) {
                    // Try to decode as string
                    let text;
                    if (typeof bytes === 'string') {
                        text = bytes;
                    } else {
                        text = new TextDecoder().decode(bytes);
                    }
                    console.log('Message text:', text.substring(0, 100));
                    this._handleMessage(text);
                }
            } catch (e) {
                console.error('Error processing message:', e);
            }
        });

        this._connection.connect('closed', () => {
            console.log('Deepgram connection closed');
            this._isConnected = false;
            this._connection = null;
            this.emit('disconnected');
        });

        this._connection.connect('error', (connection, error) => {
            console.error('WebSocket error:', error.message);
            this.emit('error', error.message);
        });
    }

    _handleMessage(text) {
        try {
            const data = JSON.parse(text);

            if (data.type === 'Results') {
                const channel = data.channel;
                if (channel && channel.alternatives && channel.alternatives.length > 0) {
                    const alternative = channel.alternatives[0];
                    const transcript = alternative.transcript || '';

                    if (transcript) {
                        const isFinal = data.is_final || false;
                        const speechFinal = data.speech_final || false;
                        this.emit('transcript', transcript, isFinal, speechFinal);
                    }
                }
            } else if (data.type === 'UtteranceEnd') {
                // Signal end of utterance
                this.emit('transcript', '', true, true);
            } else if (data.type === 'Metadata') {
                console.log('Deepgram metadata:', data);
            } else if (data.type === 'Error') {
                console.error('Deepgram error:', data);
                this.emit('error', data.message || 'Unknown Deepgram error');
            }
        } catch (error) {
            console.error('Failed to parse Deepgram message:', error);
        }
    }

    sendAudio(audioData) {
        if (!this._isConnected || !this._connection) {
            console.log('Not connected, skipping audio send');
            return;
        }

        try {
            // Convert Int16Array to Uint8Array for WebSocket binary send
            const uint8Array = new Uint8Array(audioData.buffer, audioData.byteOffset, audioData.byteLength);
            // send_message with BINARY type
            const bytes = GLib.Bytes.new(uint8Array);
            this._connection.send_message(Soup.WebsocketDataType.BINARY, bytes);
            console.log('Sent', bytes.get_size(), 'bytes to Deepgram');
        } catch (error) {
            console.error('Failed to send audio:', error);
        }
    }

    finalize() {
        // Send empty message to signal end of audio stream
        if (this._isConnected && this._connection) {
            try {
                // Just close gracefully instead of sending empty buffer
                console.log('Finalizing Deepgram connection');
            } catch (error) {
                console.error('Failed to send finalize signal:', error);
            }
        }
    }

    disconnect() {
        if (this._reconnectTimeoutId) {
            GLib.source_remove(this._reconnectTimeoutId);
            this._reconnectTimeoutId = null;
        }

        if (this._connection) {
            try {
                this._connection.close(Soup.WebsocketCloseCode.NORMAL, 'Client disconnect');
            } catch (error) {
                // Ignore close errors
            }
            this._connection = null;
        }

        this._isConnected = false;
        this._session = null;
    }

    _scheduleReconnect() {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('error', 'Max reconnection attempts reached');
            return;
        }

        this._reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);

        console.log(`Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);

        this._reconnectTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._reconnectTimeoutId = null;
            this.connect();
            return GLib.SOURCE_REMOVE;
        });
    }

    get isConnected() {
        return this._isConnected;
    }

    destroy() {
        this.disconnect();
    }
});
