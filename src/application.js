import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { SpeakdWindow } from './window.js';
import { PreferencesDialog } from './preferences.js';
import { SettingsService } from './services/settingsService.js';

export const SpeakdApplication = GObject.registerClass(
class SpeakdApplication extends Adw.Application {

    constructor(params = {}) {
        super({
            ...params,
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
        });

        this._version = params.version || '0.0.0';
        this._settings = new SettingsService();

        // Register command-line options
        this.add_main_option(
            'toggle', 't'.charCodeAt(0),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            'Toggle listening on/off',
            null
        );

        this.add_main_option(
            'start', 's'.charCodeAt(0),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            'Start listening',
            null
        );

        this.add_main_option(
            'stop', 'x'.charCodeAt(0),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            'Stop listening',
            null
        );

        // Add actions
        const quitAction = new Gio.SimpleAction({ name: 'quit' });
        quitAction.connect('activate', () => this.quit());
        this.add_action(quitAction);
        this.set_accels_for_action('app.quit', ['<Control>q']);

        const aboutAction = new Gio.SimpleAction({ name: 'about' });
        aboutAction.connect('activate', () => this._showAbout());
        this.add_action(aboutAction);

        const preferencesAction = new Gio.SimpleAction({ name: 'preferences' });
        preferencesAction.connect('activate', () => this._showPreferences());
        this.add_action(preferencesAction);
        this.set_accels_for_action('app.preferences', ['<Control>comma']);

        // Toggle action (can be invoked via D-Bus)
        const toggleAction = new Gio.SimpleAction({ name: 'toggle' });
        toggleAction.connect('activate', () => this._toggleListening());
        this.add_action(toggleAction);
        this.set_accels_for_action('app.toggle', ['<Control>space']);
    }

    vfunc_command_line(commandLine) {
        const options = commandLine.get_options_dict();

        // Always activate first to ensure window exists
        this.activate();

        if (options.contains('toggle')) {
            this._toggleListening();
            return 0;
        }

        if (options.contains('start')) {
            const window = this.active_window;
            if (window && !window._isListening) {
                window.toggleListening();
            }
            return 0;
        }

        if (options.contains('stop')) {
            const window = this.active_window;
            if (window && window._isListening) {
                window.toggleListening();
            }
            return 0;
        }

        return 0;
    }

    _toggleListening() {
        const window = this.active_window;
        if (window) {
            window.toggleListening();
        }
    }

    vfunc_activate() {
        let window = this.active_window;

        if (!window) {
            window = new SpeakdWindow({
                application: this,
                settings: this._settings,
            });
        }

        window.present();
    }

    get settings() {
        return this._settings;
    }

    _showPreferences() {
        const dialog = new PreferencesDialog({
            settings: this._settings,
        });

        dialog.present(this.active_window);
    }

    _showAbout() {
        const dialog = new Adw.AboutDialog({
            application_name: 'Speakd',
            application_icon: this.application_id,
            developer_name: 'Will',
            version: this._version,
            website: 'https://github.com/wchest/speakd',
            issue_url: 'https://github.com/wchest/speakd/issues',
            license_type: Gtk.License.MIT_X11,
            developers: ['Will'],
        });

        dialog.present(this.active_window);
    }
});
