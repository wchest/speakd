import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const PORTAL_BUS_NAME = 'org.freedesktop.portal.Desktop';
const PORTAL_OBJECT_PATH = '/org/freedesktop/portal/desktop';
const GLOBAL_SHORTCUTS_IFACE = 'org.freedesktop.portal.GlobalShortcuts';

export const GlobalShortcutService = GObject.registerClass({
    Signals: {
        'shortcut-activated': { param_types: [GObject.TYPE_STRING] },
        'ready': {},
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class GlobalShortcutService extends GObject.Object {

    constructor(appId) {
        super();

        this._appId = appId;
        this._sessionPath = null;
        this._proxy = null;
        this._requestCounter = 0;
        this._initialized = false;

        this._initAsync();
    }

    async _initAsync() {
        try {
            // Create proxy for GlobalShortcuts portal
            this._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.NONE,
                null,
                PORTAL_BUS_NAME,
                PORTAL_OBJECT_PATH,
                GLOBAL_SHORTCUTS_IFACE,
                null
            );

            // Create a session
            await this._createSession();

        } catch (error) {
            console.log('GlobalShortcuts portal not available:', error.message);
            this.emit('error', `Portal not available: ${error.message}`);
        }
    }

    _getRequestPath() {
        const sender = Gio.DBus.session.get_unique_name().replace(/^:/, '').replace(/\./g, '_');
        return `/org/freedesktop/portal/desktop/request/${sender}/${this._requestCounter++}`;
    }

    _createSession() {
        return new Promise((resolve, reject) => {
            const requestPath = this._getRequestPath();
            const sessionToken = `speakd_${Date.now()}`;

            // Watch for Response signal
            const responseId = Gio.DBus.session.signal_subscribe(
                PORTAL_BUS_NAME,
                'org.freedesktop.portal.Request',
                'Response',
                requestPath,
                null,
                Gio.DBusSignalFlags.NO_MATCH_RULE,
                (connection, sender, path, iface, signal, params) => {
                    Gio.DBus.session.signal_unsubscribe(responseId);

                    const [response, results] = params.deep_unpack();
                    if (response === 0) {
                        this._sessionPath = results.session_handle;
                        console.log('GlobalShortcuts session created:', this._sessionPath);
                        this._subscribeToActivated();
                        this._bindShortcuts().then(resolve).catch(reject);
                    } else {
                        reject(new Error(`Session creation failed with response ${response}`));
                    }
                }
            );

            // Call CreateSession
            this._proxy.call(
                'CreateSession',
                new GLib.Variant('(a{sv})', [{
                    'handle_token': new GLib.Variant('s', `request_${this._requestCounter}`),
                    'session_handle_token': new GLib.Variant('s', sessionToken),
                }]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (proxy, result) => {
                    try {
                        proxy.call_finish(result);
                    } catch (e) {
                        Gio.DBus.session.signal_unsubscribe(responseId);
                        reject(e);
                    }
                }
            );
        });
    }

    _subscribeToActivated() {
        // Subscribe to Activated signal
        Gio.DBus.session.signal_subscribe(
            PORTAL_BUS_NAME,
            GLOBAL_SHORTCUTS_IFACE,
            'Activated',
            PORTAL_OBJECT_PATH,
            null,
            Gio.DBusSignalFlags.NO_MATCH_RULE,
            (connection, sender, path, iface, signal, params) => {
                const [sessionHandle, shortcutId, timestamp, options] = params.deep_unpack();
                if (sessionHandle === this._sessionPath) {
                    console.log('Shortcut activated:', shortcutId);
                    this.emit('shortcut-activated', shortcutId);
                }
            }
        );
    }

    _bindShortcuts() {
        return new Promise((resolve, reject) => {
            const requestPath = this._getRequestPath();

            // Define our shortcuts
            const shortcuts = [
                {
                    id: 'toggle-listening',
                    description: 'Toggle speech-to-text listening',
                    preferred_trigger: '<Control>space',
                },
            ];

            // Convert to GVariant format
            const shortcutsVariant = shortcuts.map(s => [
                s.id,
                {
                    'description': new GLib.Variant('s', s.description),
                    'preferred_trigger': new GLib.Variant('s', s.preferred_trigger),
                }
            ]);

            // Watch for Response signal
            const responseId = Gio.DBus.session.signal_subscribe(
                PORTAL_BUS_NAME,
                'org.freedesktop.portal.Request',
                'Response',
                requestPath,
                null,
                Gio.DBusSignalFlags.NO_MATCH_RULE,
                (connection, sender, path, iface, signal, params) => {
                    Gio.DBus.session.signal_unsubscribe(responseId);

                    const [response, results] = params.deep_unpack();
                    if (response === 0) {
                        console.log('GlobalShortcuts bound successfully');
                        this._initialized = true;
                        this.emit('ready');
                        resolve();
                    } else {
                        reject(new Error(`BindShortcuts failed with response ${response}`));
                    }
                }
            );

            // Call BindShortcuts
            this._proxy.call(
                'BindShortcuts',
                new GLib.Variant('(oa(sa{sv})sa{sv})', [
                    this._sessionPath,
                    shortcutsVariant,
                    '', // parent_window
                    {
                        'handle_token': new GLib.Variant('s', `request_${this._requestCounter}`),
                    }
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (proxy, result) => {
                    try {
                        proxy.call_finish(result);
                    } catch (e) {
                        Gio.DBus.session.signal_unsubscribe(responseId);
                        reject(e);
                    }
                }
            );
        });
    }

    get isAvailable() {
        return this._initialized;
    }

    destroy() {
        if (this._sessionPath && this._proxy) {
            // Close the session
            Gio.DBus.session.call(
                PORTAL_BUS_NAME,
                this._sessionPath,
                'org.freedesktop.portal.Session',
                'Close',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null
            );
        }
        this._proxy = null;
        this._sessionPath = null;
    }
});
