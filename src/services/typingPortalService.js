import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';

const PORTAL_BUS_NAME = 'org.freedesktop.portal.Desktop';
const PORTAL_OBJECT_PATH = '/org/freedesktop/portal/desktop';
const REMOTE_DESKTOP_IFACE = 'org.freedesktop.portal.RemoteDesktop';

const DEVICE_KEYBOARD = 1;
const PERSIST_UNTIL_REVOKED = 2;
const KEY_RELEASED = 0;
const KEY_PRESSED = 1;

// Types text via the XDG RemoteDesktop portal — the only supported way to
// synthesize keystrokes on GNOME Wayland. The first use shows a permission
// dialog; the granted session is restored silently afterwards via a token.
export const TypingPortalService = GObject.registerClass({
}, class TypingPortalService extends GObject.Object {

    constructor(settings) {
        super();

        this._settings = settings;
        this._proxy = null;
        this._sessionPath = null;
        this._requestCounter = 0;
        this._connecting = null;
        this._denied = false;
    }

    // The portal reports request results on a path derived from our unique
    // bus name and the handle_token — the two must match exactly
    _makeRequest() {
        const token = `speakd_req_${this._requestCounter++}`;
        const sender = Gio.DBus.session.get_unique_name()
            .replace(/^:/, '').replace(/\./g, '_');
        return {
            token,
            path: `/org/freedesktop/portal/desktop/request/${sender}/${token}`,
        };
    }

    // Call a portal method and resolve with the Response signal's results
    _portalCall(method, buildParams) {
        return new Promise((resolve, reject) => {
            const { token, path } = this._makeRequest();

            const responseId = Gio.DBus.session.signal_subscribe(
                PORTAL_BUS_NAME,
                'org.freedesktop.portal.Request',
                'Response',
                path,
                null,
                Gio.DBusSignalFlags.NO_MATCH_RULE,
                (connection, sender, objPath, iface, signal, params) => {
                    Gio.DBus.session.signal_unsubscribe(responseId);
                    const [response, results] = params.deep_unpack();
                    if (response === 0) {
                        resolve(results);
                    } else {
                        reject(new Error(`${method} failed (response ${response})`));
                    }
                }
            );

            this._proxy.call(
                method,
                buildParams(token),
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

    async _ensureSession() {
        if (this._sessionPath) return;
        if (this._denied) {
            throw new Error('Typing permission was denied');
        }
        if (this._connecting) return this._connecting;

        this._connecting = this._createSession().finally(() => {
            this._connecting = null;
        });
        return this._connecting;
    }

    async _createSession() {
        if (!this._proxy) {
            this._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.NONE,
                null,
                PORTAL_BUS_NAME,
                PORTAL_OBJECT_PATH,
                REMOTE_DESKTOP_IFACE,
                null
            );
        }

        const sessionToken = `speakd_session_${this._requestCounter++}`;
        const created = await this._portalCall('CreateSession', token =>
            new GLib.Variant('(a{sv})', [{
                'handle_token': new GLib.Variant('s', token),
                'session_handle_token': new GLib.Variant('s', sessionToken),
            }])
        );
        this._sessionPath = created.session_handle.unpack();

        // Session can be revoked from Settings > Apps at any time
        Gio.DBus.session.signal_subscribe(
            PORTAL_BUS_NAME,
            'org.freedesktop.portal.Session',
            'Closed',
            this._sessionPath,
            null,
            Gio.DBusSignalFlags.NO_MATCH_RULE,
            () => {
                console.log('RemoteDesktop portal session closed');
                this._sessionPath = null;
            }
        );

        await this._portalCall('SelectDevices', token => {
            const options = {
                'handle_token': new GLib.Variant('s', token),
                'types': new GLib.Variant('u', DEVICE_KEYBOARD),
                'persist_mode': new GLib.Variant('u', PERSIST_UNTIL_REVOKED),
            };
            const restoreToken = this._settings?.remoteDesktopRestoreToken;
            if (restoreToken) {
                options['restore_token'] = new GLib.Variant('s', restoreToken);
            }
            return new GLib.Variant('(oa{sv})', [this._sessionPath, options]);
        });

        let results;
        try {
            results = await this._portalCall('Start', token =>
                new GLib.Variant('(osa{sv})', [
                    this._sessionPath,
                    '',  // parent window
                    { 'handle_token': new GLib.Variant('s', token) },
                ])
            );
        } catch (e) {
            // Don't re-prompt on every utterance after a denial
            this._denied = true;
            this._sessionPath = null;
            throw e;
        }

        const newToken = results.restore_token?.unpack();
        if (newToken && this._settings) {
            this._settings.remoteDesktopRestoreToken = newToken;
        }
        console.log('RemoteDesktop portal session ready');
    }

    async typeText(text) {
        await this._ensureSession();

        for (const ch of text) {
            let keysym;
            if (ch === '\n') {
                keysym = 0xff0d;  // XK_Return
            } else if (ch === '\t') {
                keysym = 0xff09;  // XK_Tab
            } else {
                keysym = Gdk.unicode_to_keyval(ch.codePointAt(0));
            }
            await this._notifyKeysym(keysym, KEY_PRESSED);
            await this._notifyKeysym(keysym, KEY_RELEASED);
        }
    }

    _notifyKeysym(keysym, state) {
        return new Promise((resolve, reject) => {
            this._proxy.call(
                'NotifyKeyboardKeysym',
                new GLib.Variant('(oa{sv}iu)', [this._sessionPath, {}, keysym, state]),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (proxy, result) => {
                    try {
                        proxy.call_finish(result);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    destroy() {
        if (this._sessionPath) {
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
            this._sessionPath = null;
        }
        this._proxy = null;
    }
});
