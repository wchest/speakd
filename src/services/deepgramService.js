import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export const DeepgramService = GObject.registerClass({
}, class DeepgramService extends GObject.Object {

    constructor(settings) {
        super();

        this._settings = settings;
        this._session = null;
        this._connection = null;
        this._isConnected = false;
        this._keepaliveId = null;
        this._reconnectId = null;
        this._closeTimeoutId = null;
        this._intentionalClose = false;

        // Callbacks
        this.onTranscript = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;

        // Deepgram configuration (smart_format implies punctuation)
        this._config = {
            model: 'nova-3',
            language: 'en-US',
            smart_format: 'true',
            interim_results: 'true',
            endpointing: '300',
            utterance_end_ms: '1000',
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
            mip_opt_out: 'true',
        };
    }

    _buildUrl() {
        const params = Object.entries(this._config)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        return `wss://api.deepgram.com/v1/listen?${params}`;
    }

    connect() {
        if (this._isConnected || this._connection) return;

        const apiKey = this._settings?.apiKey;
        if (!apiKey) {
            if (this.onError) this.onError('No API key configured');
            return;
        }

        this._intentionalClose = false;
        console.log('Connecting to Deepgram...');
        this._session = new Soup.Session();
        const url = this._buildUrl();

        const message = new Soup.Message({
            method: 'GET',
            uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
        });
        message.get_request_headers().append('Authorization', `Token ${apiKey}`);

        this._session.websocket_connect_async(
            message, null, null, GLib.PRIORITY_DEFAULT, null,
            (session, result) => {
                try {
                    this._connection = session.websocket_connect_finish(result);
                    this._isConnected = true;
                    console.log('Deepgram connected');

                    this._connection.connect('message', (conn, type, msg) => {
                        if (type === Soup.WebsocketDataType.TEXT) {
                            const bytes = msg.get_data();
                            const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
                            this._handleMessage(text);
                        }
                    });

                    this._connection.connect('closed', () => {
                        console.log('Deepgram connection closed');
                        this._isConnected = false;
                        this._connection = null;
                        this._session = null;
                        this._stopKeepalive();
                        this._clearCloseTimeout();
                        if (this.onDisconnected) this.onDisconnected();
                        if (!this._intentionalClose) this._scheduleReconnect();
                    });

                    this._startKeepalive();
                    if (this.onConnected) this.onConnected();

                } catch (error) {
                    console.error('WebSocket connection failed:', error.message);
                    if (this.onError) this.onError(error.message);
                }
            }
        );
    }

    _handleMessage(text) {
        try {
            const data = JSON.parse(text);

            if (data.type === 'Results') {
                const alt = data.channel?.alternatives?.[0];
                if (alt?.transcript && this.onTranscript) {
                    // from_finalize marks results flushed by our Finalize message
                    const speechFinal = data.speech_final || data.from_finalize;
                    this.onTranscript(alt.transcript, data.is_final, speechFinal);
                }
            } else if (data.type === 'UtteranceEnd') {
                if (this.onTranscript) {
                    this.onTranscript('', true, true);
                }
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    }

    _sendText(json) {
        if (!this._connection) return;
        try {
            const bytes = GLib.Bytes.new(new TextEncoder().encode(json));
            this._connection.send_message(Soup.WebsocketDataType.TEXT, bytes);
        } catch (e) {
            console.error('Failed to send control message:', e);
        }
    }

    // Ask Deepgram to flush buffered audio as final results (KeepAlive-only
    // periods won't finalize on their own, so call this when speech ends)
    finalize() {
        if (this._isConnected) this._sendText('{"type":"Finalize"}');
    }

    _startKeepalive() {
        this._stopKeepalive();
        // Deepgram closes the socket after 10s without audio; docs recommend 3-5s
        this._keepaliveId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            if (this._isConnected) this._sendText('{"type":"KeepAlive"}');
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopKeepalive() {
        if (this._keepaliveId) {
            GLib.source_remove(this._keepaliveId);
            this._keepaliveId = null;
        }
    }

    _scheduleReconnect() {
        if (this._reconnectId) return;
        console.log('Deepgram connection lost, reconnecting in 1s...');
        this._reconnectId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._reconnectId = null;
            if (!this._intentionalClose) this.connect();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearReconnect() {
        if (this._reconnectId) {
            GLib.source_remove(this._reconnectId);
            this._reconnectId = null;
        }
    }

    _clearCloseTimeout() {
        if (this._closeTimeoutId) {
            GLib.source_remove(this._closeTimeoutId);
            this._closeTimeoutId = null;
        }
    }

    sendAudio(audioData) {
        if (!this._isConnected || !this._connection) return;

        try {
            const uint8Array = new Uint8Array(audioData.buffer, audioData.byteOffset, audioData.byteLength);
            this._connection.send_message(Soup.WebsocketDataType.BINARY, GLib.Bytes.new(uint8Array));
        } catch (e) {
            console.error('Failed to send audio:', e);
        }
    }

    disconnect() {
        this._intentionalClose = true;
        this._clearReconnect();
        this._stopKeepalive();

        if (this._connection && this._isConnected) {
            // Graceful close: CloseStream makes the server flush remaining
            // final transcripts before closing; force-close if it never does
            this._sendText('{"type":"CloseStream"}');
            this._isConnected = false;
            this._clearCloseTimeout();
            this._closeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                this._closeTimeoutId = null;
                if (this._connection) {
                    try {
                        this._connection.close(Soup.WebsocketCloseCode.NORMAL, null);
                    } catch (e) {}
                    this._connection = null;
                    this._session = null;
                }
                return GLib.SOURCE_REMOVE;
            });
        } else if (this._connection) {
            try {
                this._connection.close(Soup.WebsocketCloseCode.NORMAL, null);
            } catch (e) {}
            this._connection = null;
            this._isConnected = false;
            this._session = null;
        }
    }

    get isConnected() {
        return this._isConnected;
    }

    destroy() {
        this.disconnect();
        this._clearCloseTimeout();
        if (this._connection) {
            try {
                this._connection.close(Soup.WebsocketCloseCode.NORMAL, null);
            } catch (e) {}
            this._connection = null;
        }
        this._session = null;
    }
});
