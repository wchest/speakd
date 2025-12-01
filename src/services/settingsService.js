import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const SettingsService = GObject.registerClass({
    Signals: {
        'api-key-changed': { param_types: [GObject.TYPE_STRING] },
        'settings-changed': { param_types: [GObject.TYPE_STRING] },
    },
}, class SettingsService extends GObject.Object {

    constructor() {
        super();

        this._configFile = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'speakd',
            'settings.json'
        ]);

        // Try to get schema from installed location or compile locally
        try {
            this._settings = new Gio.Settings({
                schema_id: 'io.github.wchest.Speakd',
            });
        } catch (e) {
            // For development, use a local config file
            console.log('Using development settings (GSettings schema not installed)');
            this._settings = null;
            this._devSettings = {
                'api-key': '',
                'listening-mode': 'always-on',
                'output-mode': 'clipboard',
                'vad-threshold': 0.5,
                'silence-duration': 1500,
                'input-device': '',
            };
            this._loadDevSettings();
        }
    }

    _loadDevSettings() {
        try {
            const file = Gio.File.new_for_path(this._configFile);
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder();
                    const json = decoder.decode(contents);
                    const saved = JSON.parse(json);
                    Object.assign(this._devSettings, saved);
                    console.log('Loaded settings from', this._configFile);
                }
            }
        } catch (e) {
            console.log('Could not load settings:', e.message);
        }
    }

    _saveDevSettings() {
        try {
            // Ensure directory exists
            const dir = Gio.File.new_for_path(GLib.build_filenamev([
                GLib.get_user_config_dir(),
                'speakd'
            ]));
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }

            const file = Gio.File.new_for_path(this._configFile);
            const json = JSON.stringify(this._devSettings, null, 2);
            file.replace_contents(json, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            console.log('Saved settings to', this._configFile);
        } catch (e) {
            console.error('Could not save settings:', e.message);
        }
    }

    get_string(key) {
        if (this._settings) {
            return this._settings.get_string(key);
        }
        return this._devSettings[key] || '';
    }

    set_string(key, value) {
        if (this._settings) {
            this._settings.set_string(key, value);
        } else {
            this._devSettings[key] = value;
            this._saveDevSettings();
        }
        this.emit('settings-changed', key);
        if (key === 'api-key') {
            this.emit('api-key-changed', value);
        }
    }

    get_double(key) {
        if (this._settings) {
            return this._settings.get_double(key);
        }
        return this._devSettings[key] || 0.0;
    }

    set_double(key, value) {
        if (this._settings) {
            this._settings.set_double(key, value);
        } else {
            this._devSettings[key] = value;
            this._saveDevSettings();
        }
        this.emit('settings-changed', key);
    }

    get_int(key) {
        if (this._settings) {
            return this._settings.get_int(key);
        }
        return this._devSettings[key] || 0;
    }

    set_int(key, value) {
        if (this._settings) {
            this._settings.set_int(key, value);
        } else {
            this._devSettings[key] = value;
            this._saveDevSettings();
        }
        this.emit('settings-changed', key);
    }

    get apiKey() {
        return this.get_string('api-key');
    }

    set apiKey(value) {
        this.set_string('api-key', value);
    }

    get listeningMode() {
        return this.get_string('listening-mode');
    }

    set listeningMode(value) {
        this.set_string('listening-mode', value);
    }

    get outputMode() {
        return this.get_string('output-mode');
    }

    set outputMode(value) {
        this.set_string('output-mode', value);
    }

    get vadThreshold() {
        return this.get_double('vad-threshold');
    }

    set vadThreshold(value) {
        this.set_double('vad-threshold', value);
    }

    get silenceDuration() {
        return this.get_int('silence-duration');
    }

    set silenceDuration(value) {
        this.set_int('silence-duration', value);
    }

    get inputDevice() {
        return this.get_string('input-device');
    }

    set inputDevice(value) {
        this.set_string('input-device', value);
    }

    get hasApiKey() {
        return this.apiKey.length > 0;
    }
});
