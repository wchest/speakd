import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

export const PreferencesDialog = GObject.registerClass(
class PreferencesDialog extends Adw.PreferencesDialog {

    constructor(params = {}) {
        const { settings, ...parentParams } = params;
        super(parentParams);

        this._settings = settings;

        this._buildUI();
        this._loadSettings();
    }

    _buildUI() {
        // Deepgram Page
        const deepgramPage = new Adw.PreferencesPage({
            title: 'Deepgram',
            icon_name: 'network-server-symbolic',
        });
        this.add(deepgramPage);

        // API Key Group
        const apiGroup = new Adw.PreferencesGroup({
            title: 'API Configuration',
            description: 'Get your API key from console.deepgram.com',
        });
        deepgramPage.add(apiGroup);

        // API Key Entry
        this._apiKeyRow = new Adw.PasswordEntryRow({
            title: 'API Key',
        });
        this._apiKeyRow.connect('changed', () => this._onApiKeyChanged());
        apiGroup.add(this._apiKeyRow);

        // API Key Status
        this._apiStatusRow = new Adw.ActionRow({
            title: 'Status',
            subtitle: 'Not configured',
        });
        this._apiStatusIcon = new Gtk.Image({
            icon_name: 'dialog-warning-symbolic',
            css_classes: ['warning'],
        });
        this._apiStatusRow.add_suffix(this._apiStatusIcon);
        apiGroup.add(this._apiStatusRow);

        // Validate button
        const validateButton = new Gtk.Button({
            label: 'Validate Key',
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });
        validateButton.connect('clicked', () => this._validateApiKey());
        this._apiStatusRow.add_suffix(validateButton);

        // Audio Page
        const audioPage = new Adw.PreferencesPage({
            title: 'Audio',
            icon_name: 'audio-input-microphone-symbolic',
        });
        this.add(audioPage);

        // Input Device Group
        const inputGroup = new Adw.PreferencesGroup({
            title: 'Input Device',
        });
        audioPage.add(inputGroup);

        // Device Dropdown
        this._deviceRow = new Adw.ComboRow({
            title: 'Microphone',
            subtitle: 'Select your input device',
        });

        // Placeholder devices for now
        const deviceModel = new Gtk.StringList();
        deviceModel.append('Default');
        deviceModel.append('Built-in Microphone');
        deviceModel.append('USB Microphone');
        this._deviceRow.set_model(deviceModel);
        this._deviceRow.connect('notify::selected', () => this._onDeviceChanged());
        inputGroup.add(this._deviceRow);

        // VAD Settings Group
        const vadGroup = new Adw.PreferencesGroup({
            title: 'Voice Detection',
        });
        audioPage.add(vadGroup);

        // VAD Threshold
        this._vadRow = new Adw.ActionRow({
            title: 'Sensitivity',
            subtitle: 'Higher values require louder speech',
        });

        this._vadScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 0.9,
                step_increment: 0.1,
                page_increment: 0.1,
            }),
            hexpand: true,
            valign: Gtk.Align.CENTER,
            draw_value: true,
            digits: 1,
        });
        this._vadScale.set_size_request(200, -1);
        this._vadScale.connect('value-changed', () => this._onVadChanged());
        this._vadRow.add_suffix(this._vadScale);
        vadGroup.add(this._vadRow);

        // Silence Duration
        this._silenceRow = new Adw.SpinRow({
            title: 'Silence Duration',
            subtitle: 'Milliseconds of silence before finalizing',
            adjustment: new Gtk.Adjustment({
                lower: 500,
                upper: 5000,
                step_increment: 100,
                page_increment: 500,
                value: 1500,
            }),
        });
        this._silenceRow.connect('notify::value', () => this._onSilenceChanged());
        vadGroup.add(this._silenceRow);

        // Output Page
        const outputPage = new Adw.PreferencesPage({
            title: 'Output',
            icon_name: 'edit-paste-symbolic',
        });
        this.add(outputPage);

        // Output Mode Group
        const outputGroup = new Adw.PreferencesGroup({
            title: 'Output Mode',
            description: 'How transcribed text is delivered',
        });
        outputPage.add(outputGroup);

        // Listening Mode
        this._listeningModeRow = new Adw.ComboRow({
            title: 'Listening Mode',
            subtitle: 'When to transcribe speech',
        });
        const listeningModel = new Gtk.StringList();
        listeningModel.append('Always On');
        listeningModel.append('Push-to-Talk');
        listeningModel.append('Toggle');
        this._listeningModeRow.set_model(listeningModel);
        this._listeningModeRow.connect('notify::selected', () => this._onListeningModeChanged());
        outputGroup.add(this._listeningModeRow);

        // Output Mode
        this._outputModeRow = new Adw.ComboRow({
            title: 'Output Mode',
            subtitle: 'Where to send transcribed text',
        });
        const outputModel = new Gtk.StringList();
        outputModel.append('Clipboard');
        outputModel.append('Type at Cursor');
        outputModel.append('Both');
        this._outputModeRow.set_model(outputModel);
        this._outputModeRow.connect('notify::selected', () => this._onOutputModeChanged());
        outputGroup.add(this._outputModeRow);
    }

    _loadSettings() {
        if (!this._settings) return;

        // Load API Key
        const apiKey = this._settings.apiKey;
        if (apiKey) {
            this._apiKeyRow.set_text(apiKey);
            this._updateApiStatus(true);
        }

        // Load VAD settings
        this._vadScale.set_value(this._settings.vadThreshold);
        this._silenceRow.set_value(this._settings.silenceDuration);

        // Load listening mode
        const listeningModes = ['always-on', 'push-to-talk', 'toggle'];
        const listeningIndex = listeningModes.indexOf(this._settings.listeningMode);
        if (listeningIndex >= 0) {
            this._listeningModeRow.set_selected(listeningIndex);
        }

        // Load output mode
        const outputModes = ['clipboard', 'insert', 'both'];
        const outputIndex = outputModes.indexOf(this._settings.outputMode);
        if (outputIndex >= 0) {
            this._outputModeRow.set_selected(outputIndex);
        }
    }

    _onApiKeyChanged() {
        const apiKey = this._apiKeyRow.get_text();
        if (this._settings) {
            this._settings.apiKey = apiKey;
        }
        this._updateApiStatus(apiKey.length > 0);
    }

    _updateApiStatus(hasKey) {
        if (hasKey) {
            this._apiStatusRow.set_subtitle('Key configured');
            this._apiStatusIcon.set_from_icon_name('emblem-ok-symbolic');
            this._apiStatusIcon.set_css_classes(['success']);
        } else {
            this._apiStatusRow.set_subtitle('Not configured');
            this._apiStatusIcon.set_from_icon_name('dialog-warning-symbolic');
            this._apiStatusIcon.set_css_classes(['warning']);
        }
    }

    _validateApiKey() {
        const apiKey = this._apiKeyRow.get_text();
        if (!apiKey) {
            this._showToast('Please enter an API key first');
            return;
        }

        // TODO: Actually validate with Deepgram API
        this._apiStatusRow.set_subtitle('Validating...');

        // Simulate validation
        setTimeout(() => {
            if (apiKey.length > 10) {
                this._apiStatusRow.set_subtitle('Key validated');
                this._apiStatusIcon.set_from_icon_name('emblem-ok-symbolic');
                this._apiStatusIcon.set_css_classes(['success']);
                this._showToast('API key validated successfully');
            } else {
                this._apiStatusRow.set_subtitle('Invalid key');
                this._apiStatusIcon.set_from_icon_name('dialog-error-symbolic');
                this._apiStatusIcon.set_css_classes(['error']);
                this._showToast('API key validation failed');
            }
        }, 1000);
    }

    _onDeviceChanged() {
        const selected = this._deviceRow.get_selected();
        const devices = ['', 'built-in', 'usb'];
        if (this._settings && selected < devices.length) {
            this._settings.inputDevice = devices[selected];
        }
    }

    _onVadChanged() {
        if (this._settings) {
            this._settings.vadThreshold = this._vadScale.get_value();
        }
    }

    _onSilenceChanged() {
        if (this._settings) {
            this._settings.silenceDuration = this._silenceRow.get_value();
        }
    }

    _onListeningModeChanged() {
        const modes = ['always-on', 'push-to-talk', 'toggle'];
        const selected = this._listeningModeRow.get_selected();
        if (this._settings && selected < modes.length) {
            this._settings.listeningMode = modes[selected];
        }
    }

    _onOutputModeChanged() {
        const modes = ['clipboard', 'insert', 'both'];
        const selected = this._outputModeRow.get_selected();
        if (this._settings && selected < modes.length) {
            this._settings.outputMode = modes[selected];
        }
    }

    _showToast(message) {
        const toast = new Adw.Toast({ title: message });
        this.add_toast(toast);
    }
});
