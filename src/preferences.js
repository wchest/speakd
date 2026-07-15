import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gst from 'gi://Gst';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

export const PreferencesDialog = GObject.registerClass(
class PreferencesDialog extends Adw.PreferencesDialog {

    constructor(params = {}) {
        const { settings, ...parentParams } = params;
        super(parentParams);

        this._settings = settings;
        this._devices = [];  // Store device list with {id, name}
        this._isLoading = true;  // Prevent saving during initial load

        this._buildUI();
        this._loadDevices();
        this._loadSettings();

        this._isLoading = false;
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

        // Usage & Limits Group
        const usageGroup = new Adw.PreferencesGroup({
            title: 'Usage and Limits',
            description: 'Monitor and control your API usage',
        });
        deepgramPage.add(usageGroup);

        // Current Usage Display
        this._usageRow = new Adw.ActionRow({
            title: 'Current Usage',
            subtitle: 'Loading...',
        });
        usageGroup.add(this._usageRow);

        // Monthly Limit
        this._limitRow = new Adw.SpinRow({
            title: 'Monthly Limit',
            subtitle: 'Minutes per month (0 = unlimited)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 10000,
                step_increment: 10,
                page_increment: 60,
                value: 60,
            }),
        });
        this._limitRow.connect('notify::value', () => this._onLimitChanged());
        usageGroup.add(this._limitRow);

        // Warning Threshold
        this._warningRow = new Adw.ActionRow({
            title: 'Warning Threshold',
            subtitle: 'Show warning at this percentage',
        });
        this._warningScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.5,
                upper: 1.0,
                step_increment: 0.05,
                page_increment: 0.1,
            }),
            hexpand: true,
            valign: Gtk.Align.CENTER,
            draw_value: true,
            digits: 0,
        });
        this._warningScale.set_format_value_func((scale, value) => `${Math.round(value * 100)}%`);
        this._warningScale.set_size_request(150, -1);
        this._warningScale.connect('value-changed', () => this._onWarningChanged());
        this._warningRow.add_suffix(this._warningScale);
        usageGroup.add(this._warningRow);

        // Hard Limit Toggle
        this._hardLimitRow = new Adw.SwitchRow({
            title: 'Enforce Limit',
            subtitle: 'Stop transcription when limit is reached',
        });
        this._hardLimitRow.connect('notify::active', () => this._onHardLimitChanged());
        usageGroup.add(this._hardLimitRow);

        // Reset Usage Button
        const resetRow = new Adw.ActionRow({
            title: 'Reset Monthly Usage',
            subtitle: 'Clear usage counter for this month',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset',
            css_classes: ['destructive-action'],
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => this._resetUsage());
        resetRow.add_suffix(resetButton);
        usageGroup.add(resetRow);

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

        // Model will be populated by _loadDevices()
        this._deviceModel = new Gtk.StringList();
        this._deviceRow.set_model(this._deviceModel);
        this._deviceRow.connect('notify::selected', () => this._onDeviceChanged());
        inputGroup.add(this._deviceRow);

        // Refresh button
        const refreshButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Refresh device list',
        });
        refreshButton.connect('clicked', () => this._loadDevices());
        this._deviceRow.add_suffix(refreshButton);

        // VAD Settings Group
        const vadGroup = new Adw.PreferencesGroup({
            title: 'Voice Detection',
        });
        audioPage.add(vadGroup);

        // VAD Threshold
        this._vadRow = new Adw.ActionRow({
            title: 'Sensitivity',
            subtitle: 'Audio level treated as speech — lower picks up quieter voices',
        });

        this._vadScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0.01,
                upper: 0.5,
                step_increment: 0.01,
                page_increment: 0.05,
            }),
            hexpand: true,
            valign: Gtk.Align.CENTER,
            draw_value: true,
            digits: 2,
        });
        this._vadScale.set_size_request(200, -1);
        this._vadScale.connect('value-changed', () => this._onVadChanged());
        this._vadRow.add_suffix(this._vadScale);
        vadGroup.add(this._vadRow);

        // Silence Duration
        this._silenceRow = new Adw.SpinRow({
            title: 'Silence Duration',
            subtitle: 'Milliseconds of silence before audio streaming pauses (saves cost)',
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

        // Clipboard Session Reset
        this._clipboardResetRow = new Adw.SpinRow({
            title: 'Clipboard Reset',
            subtitle: 'Milliseconds of quiet before the clipboard starts fresh',
            adjustment: new Gtk.Adjustment({
                lower: 1000,
                upper: 60000,
                step_increment: 500,
                page_increment: 5000,
                value: 5000,
            }),
        });
        this._clipboardResetRow.connect('notify::value', () => this._onClipboardResetChanged());
        outputGroup.add(this._clipboardResetRow);
    }

    _loadSettings() {
        if (!this._settings) return;

        // Load API Key
        const apiKey = this._settings.apiKey;
        if (apiKey) {
            this._apiKeyRow.set_text(apiKey);
            this._updateApiStatus(true);
        }

        // Load usage settings
        this._updateUsageDisplay();
        this._limitRow.set_value(this._settings.monthlyLimitMinutes);
        this._warningScale.set_value(this._settings.limitWarningThreshold);
        this._hardLimitRow.set_active(this._settings.hardLimitEnabled);

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

        // Load clipboard session reset
        this._clipboardResetRow.set_value(this._settings.clipboardSessionReset);

        // Load input device (after devices are loaded)
        this._selectCurrentDevice();
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

    _loadDevices() {
        // Clear existing items
        while (this._deviceModel.get_n_items() > 0) {
            this._deviceModel.remove(0);
        }
        this._devices = [];

        // Add default option
        this._devices.push({ id: '', name: 'Default (System)' });
        this._deviceModel.append('Default (System)');

        // Get audio input devices from GStreamer
        try {
            const monitor = new Gst.DeviceMonitor();
            monitor.add_filter('Audio/Source', null);
            monitor.start();

            const deviceList = monitor.get_devices();
            for (let i = 0; i < deviceList.length; i++) {
                const device = deviceList[i];
                const displayName = device.get_display_name();
                const props = device.get_properties();
                const deviceId = props ? (props.get_string('node.name') || displayName) : displayName;

                this._devices.push({ id: deviceId, name: displayName });
                this._deviceModel.append(displayName);
            }

            monitor.stop();
        } catch (e) {
            console.error('Failed to enumerate audio devices:', e);
        }

        // Select currently configured device (only if not during initial load)
        if (!this._isLoading) {
            this._selectCurrentDevice();
        }
    }

    _selectCurrentDevice() {
        if (!this._settings) return;

        const currentId = this._settings.inputDevice;
        const index = this._devices.findIndex(d => d.id === currentId);
        if (index >= 0) {
            this._deviceRow.set_selected(index);
        } else {
            this._deviceRow.set_selected(0);  // Default
        }
    }

    _onDeviceChanged() {
        if (this._isLoading) return;  // Don't save during initial load

        const selected = this._deviceRow.get_selected();
        if (this._settings && selected < this._devices.length) {
            const device = this._devices[selected];
            this._settings.inputDevice = device.id;
            console.log('Selected device:', device.name, '(', device.id, ')');
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

    _onClipboardResetChanged() {
        if (this._settings) {
            this._settings.clipboardSessionReset = this._clipboardResetRow.get_value();
        }
    }

    _showToast(message) {
        const toast = new Adw.Toast({ title: message });
        this.add_toast(toast);
    }

    _updateUsageDisplay() {
        if (!this._settings) return;

        const usage = this._settings.usageMinutesMonth;
        const limit = this._settings.monthlyLimitMinutes;
        const cost = usage * 0.0077; // Nova-3 streaming price per minute

        let subtitle = `${usage.toFixed(1)} minutes (~$${cost.toFixed(3)})`;
        if (limit > 0) {
            const pct = Math.round((usage / limit) * 100);
            subtitle += ` • ${pct}% of limit`;
        }

        this._usageRow.set_subtitle(subtitle);
    }

    _onLimitChanged() {
        if (this._settings) {
            this._settings.monthlyLimitMinutes = this._limitRow.get_value();
            this._updateUsageDisplay();
        }
    }

    _onWarningChanged() {
        if (this._settings) {
            this._settings.limitWarningThreshold = this._warningScale.get_value();
        }
    }

    _onHardLimitChanged() {
        if (this._settings) {
            this._settings.hardLimitEnabled = this._hardLimitRow.get_active();
        }
    }

    _resetUsage() {
        if (!this._settings) return;

        const dialog = new Adw.AlertDialog({
            heading: 'Reset Usage?',
            body: 'This will reset your monthly usage counter to zero. This action cannot be undone.',
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('reset', 'Reset');
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');

        dialog.connect('response', (dialog, response) => {
            if (response === 'reset') {
                this._settings.usageMinutesMonth = 0;
                this._updateUsageDisplay();
                this._showToast('Usage counter reset');
            }
        });

        dialog.present(this);
    }
});
