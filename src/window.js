import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { AudioService } from './services/audioService.js';
import { DeepgramService } from './services/deepgramService.js';
import { OutputService } from './services/outputService.js';
import { UsageService } from './services/usageService.js';

export const SpeakdWindow = GObject.registerClass(
class SpeakdWindow extends Adw.ApplicationWindow {

    constructor(params = {}) {
        const { settings, ...parentParams } = params;
        super(parentParams);

        this._settings = settings;
        this._audioService = new AudioService(settings);
        this._deepgramService = new DeepgramService(settings);
        this._outputService = new OutputService(settings);
        this._usageService = new UsageService(settings);

        this._isListening = false;
        this._finalTranscript = '';
        this._pendingOutput = '';  // Accumulates text until speech ends
        this._sessionOutput = '';  // Current dictation burst, kept whole on the clipboard
        this._lastFlushTime = 0;

        this.set_default_size(400, 500);
        this.set_title('Speakd');

        this._buildUI();
        this._connectSignals();
        this._setupKeyboardShortcuts();
    }

    _setupKeyboardShortcuts() {
        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (controller, keyval, keycode, state) => {
            const ctrlPressed = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
            const isSpace = keyval === Gdk.KEY_space;

            if (ctrlPressed && isSpace) {
                this.toggleListening();
                return true; // Event handled
            }
            return false;
        });
        this.add_controller(controller);
    }

    _buildUI() {
        // Create header bar
        const headerBar = new Adw.HeaderBar();

        // Menu button
        const menuButton = new Gtk.MenuButton({
            icon_name: 'open-menu-symbolic',
            menu_model: this._createMenu(),
        });
        headerBar.pack_end(menuButton);

        // Main box
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 24,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });

        // App logo as status icon
        this._statusIcon = new Gtk.Image({
            icon_name: 'io.github.wchest.Speakd',
            pixel_size: 96,
        });
        mainBox.append(this._statusIcon);

        // Status label
        this._statusLabel = new Gtk.Label({
            label: 'Ready',
            css_classes: ['title-1'],
        });
        mainBox.append(this._statusLabel);

        // Description
        this._descriptionLabel = new Gtk.Label({
            label: 'Click the button below to start listening',
            css_classes: ['dim-label'],
        });
        mainBox.append(this._descriptionLabel);

        // Audio level bar
        this._levelBar = new Gtk.LevelBar({
            min_value: 0,
            max_value: 1,
            value: 0,
            margin_top: 12,
            margin_start: 48,
            margin_end: 48,
        });
        this._levelBar.add_offset_value('low', 0.25);
        this._levelBar.add_offset_value('high', 0.5);
        this._levelBar.add_offset_value('full', 0.75);
        mainBox.append(this._levelBar);

        // Level info row showing current level and threshold
        this._levelInfoLabel = new Gtk.Label({
            label: '',
            css_classes: ['dim-label', 'caption'],
            margin_start: 48,
            margin_end: 48,
        });
        mainBox.append(this._levelInfoLabel);
        this._updateLevelInfo(0);

        // Start/Stop button
        this._toggleButton = new Gtk.Button({
            label: 'Start Listening',
            halign: Gtk.Align.CENTER,
            css_classes: ['suggested-action', 'pill'],
        });
        this._toggleButton.set_size_request(200, -1);
        this._toggleButton.connect('clicked', () => this._toggleListening());
        mainBox.append(this._toggleButton);

        // Transcript view
        this._transcriptLabel = new Gtk.Label({
            label: '',
            wrap: true,
            xalign: 0,
            yalign: 0,
            valign: Gtk.Align.START,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
            css_classes: ['body'],
            selectable: true,
        });

        this._transcriptScroll = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            min_content_height: 100,
        });
        this._transcriptScroll.set_child(this._transcriptLabel);

        const transcriptFrame = new Gtk.Frame({
            margin_top: 12,
        });
        transcriptFrame.set_child(this._transcriptScroll);
        mainBox.append(transcriptFrame);

        // Device info
        this._deviceLabel = new Gtk.Label({
            label: 'No device selected',
            css_classes: ['dim-label', 'caption'],
            halign: Gtk.Align.CENTER,
            margin_top: 12,
        });
        mainBox.append(this._deviceLabel);

        // Usage info
        this._usageLabel = new Gtk.Label({
            label: this._usageService.getUsageText(),
            css_classes: ['dim-label', 'caption'],
            halign: Gtk.Align.CENTER,
            margin_top: 6,
        });
        mainBox.append(this._usageLabel);

        // Main layout with clamp for max width
        const clamp = new Adw.Clamp({
            maximum_size: 400,
            child: mainBox,
        });

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);
        toolbarView.set_content(clamp);

        // Wrap in ToastOverlay for notifications
        this._toastOverlay = new Adw.ToastOverlay();
        this._toastOverlay.set_child(toolbarView);

        this.set_content(this._toastOverlay);

        // Update device label
        this._updateDeviceLabel();
    }

    _connectSignals() {
        // Audio level updates
        this._audioService.connect('audio-level', (service, level) => {
            this._levelBar.set_value(level);
            this._updateLevelInfo(level);
        });

        // Audio data -> send to Deepgram (connects on-demand) and track usage
        this._audioService.connect('audio-data', (service, data) => {
            this._deepgramService.sendAudio(data);
            this._usageService.trackAudio(data.length);
        });

        // VAD stopped streaming audio -> flush Deepgram's buffer so trailing
        // words become final instead of hanging as interim results
        this._audioService.connect('speech-end', () => {
            this._deepgramService.finalize();
        });

        // A long quiet gap means a new dictation burst: start the clipboard
        // fresh instead of accumulating stale text forever in always-on mode
        this._audioService.connect('speech-start', () => {
            const now = GLib.get_monotonic_time() / 1000;
            const resetMs = this._settings?.clipboardSessionReset ?? 5000;
            if (this._sessionOutput && now - this._lastFlushTime > resetMs) {
                this._sessionOutput = '';
            }
        });

        // Usage updates
        this._usageService.connect('usage-updated', () => {
            this._usageLabel.set_label(this._usageService.getUsageText());
        });

        // Usage warning threshold
        this._usageService.connect('warning-threshold', (service, percentage) => {
            this._showUsageWarning(percentage);
        });

        // Usage limit reached
        this._usageService.connect('limit-reached', () => {
            this._onLimitReached();
        });

        // Audio errors
        this._audioService.connect('error', (service, message) => {
            this._showError(`Audio: ${message}`);
        });

        // Deepgram callbacks
        this._deepgramService.onConnected = () => {
            this._onDeepgramConnected();
        };

        this._deepgramService.onDisconnected = () => {
            // Don't lose finals that never got a speech_final marker
            this._flushPendingOutput();
            if (this._isListening) {
                this._statusLabel.set_label('Reconnecting...');
            }
        };

        this._deepgramService.onTranscript = (text, isFinal, speechFinal) => {
            this._handleTranscript(text, isFinal, speechFinal);
        };

        this._deepgramService.onError = (message) => {
            this._showError(`Deepgram: ${message}`);
        };

        // Output events
        this._outputService.connect('output-complete', (service, text) => {
            this._showToast('Text copied to clipboard');
        });

        this._outputService.connect('error', (service, message) => {
            this._showError(`Output: ${message}`);
        });
    }

    _handleTranscript(text, isFinal, speechFinal) {
        if (isFinal) {
            if (text) {
                // Accumulate final text
                if (this._pendingOutput) {
                    this._pendingOutput += ' ' + text;
                } else {
                    this._pendingOutput = text;
                }
                this._finalTranscript += text + '\n';
                this._updateTranscriptDisplay();
            }

            if (speechFinal) {
                this._flushPendingOutput();
            }
        } else if (text) {
            // Interim - just display (gray)
            this._updateTranscriptDisplay(text);
        }
    }

    _flushPendingOutput() {
        if (!this._pendingOutput) return;

        if (this._sessionOutput) {
            this._sessionOutput += ' ' + this._pendingOutput;
        } else {
            this._sessionOutput = this._pendingOutput;
        }

        // Segment is typed at the cursor; clipboard gets the whole burst so
        // a paste never loses earlier phrases
        this._outputService.output(this._pendingOutput, this._sessionOutput);
        this._pendingOutput = '';
        this._lastFlushTime = GLib.get_monotonic_time() / 1000;
    }

    _updateTranscriptDisplay(interimText = '') {
        let display = this._finalTranscript;
        if (interimText) {
            display += `<span alpha="50%">${interimText}</span>`;
        }
        this._transcriptLabel.set_markup(display || '<span alpha="50%">Transcript will appear here...</span>');

        // Auto-scroll to bottom (use idle to let GTK recalculate layout first)
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            const vadj = this._transcriptScroll.get_vadjustment();
            vadj.set_value(vadj.get_upper() - vadj.get_page_size());
            return GLib.SOURCE_REMOVE;
        });
    }

    toggleListening() {
        if (this._isListening) {
            this._stopListening();
        } else {
            this._startListening();
        }
    }

    _toggleListening() {
        this.toggleListening();
    }

    _startListening() {
        // Check for API key
        if (!this._settings?.hasApiKey) {
            this._showError('Please configure your Deepgram API key in Preferences');
            return;
        }

        // Check usage limit
        if (this._usageService.isOverLimit()) {
            this._showError('Monthly usage limit reached. Adjust in Preferences.');
            return;
        }

        try {
            // Connect to Deepgram first (stays connected with keepalive)
            this._deepgramService.connect();

            // Start audio capture
            const deviceId = this._settings?.inputDevice || null;
            this._audioService.start(deviceId);

            this._isListening = true;
            this._toggleButton.set_label('Stop');
            this._toggleButton.set_css_classes(['destructive-action', 'pill']);
            this._statusLabel.set_label('Listening...');
            this._descriptionLabel.set_label('Speak now');

            // Clear previous transcript
            this._finalTranscript = '';
            this._pendingOutput = '';
            this._sessionOutput = '';
            this._updateTranscriptDisplay();
        } catch (error) {
            console.error('Failed to start audio:', error);
            this._showError(`Failed to start audio: ${error.message}`);
        }
    }

    _onDeepgramConnected() {
        this._statusLabel.set_label(this._isListening ? 'Listening...' : 'Connected');
    }

    _stopListening() {
        // Stop audio first (emits speech-end -> Finalize if mid-speech)
        this._audioService.stop();

        // Graceful close: CloseStream flushes remaining finals, which still
        // arrive via onTranscript; onDisconnected flushes any leftover output
        this._deepgramService.disconnect();

        this._isListening = false;
        this._resetUI();
    }

    _resetUI() {
        this._levelBar.set_value(0);
        // Logo keeps its own colors
        this._statusLabel.set_label('Ready');
        this._descriptionLabel.set_label('Click the button below to start listening');
        this._toggleButton.set_label('Start Listening');
        this._toggleButton.set_css_classes(['suggested-action', 'pill']);
    }

    _updateLevelInfo(level) {
        const threshold = this._settings?.vadThreshold ?? 0.05;
        this._levelInfoLabel.set_label(`Level: ${level.toFixed(2)} / Threshold: ${threshold.toFixed(2)}`);
    }

    _updateDeviceLabel() {
        const devices = this._audioService.getDevices();
        if (devices.length > 0) {
            const selectedId = this._settings?.inputDevice;
            const device = selectedId
                ? devices.find(d => d.id === selectedId)
                : devices[0];

            if (device) {
                this._deviceLabel.set_label(`Using: ${device.name}`);
            } else {
                this._deviceLabel.set_label(`${devices.length} device(s) available`);
            }
        } else {
            this._deviceLabel.set_label('No audio devices found');
        }
    }

    _showError(message) {
        console.error('Error:', message);
        const toast = new Adw.Toast({
            title: message,
            timeout: 5,
        });
        this._toastOverlay.add_toast(toast);
    }

    _showToast(message) {
        const toast = new Adw.Toast({
            title: message,
            timeout: 2,
        });
        this._toastOverlay.add_toast(toast);
    }

    _showUsageWarning(percentage) {
        const pct = Math.round(percentage * 100);
        const dialog = new Adw.AlertDialog({
            heading: 'Usage Warning',
            body: `You've used ${pct}% of your monthly limit.\n\nCurrent usage: ${this._usageService.monthlyMinutes.toFixed(1)} minutes\nEstimated cost: $${this._usageService.getEstimatedCost().toFixed(3)}`,
        });
        dialog.add_response('continue', 'Continue');
        dialog.add_response('stop', 'Stop Listening');
        dialog.set_response_appearance('stop', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('continue');

        dialog.connect('response', (dialog, response) => {
            if (response === 'stop') {
                this._stopListening();
            }
        });

        dialog.present(this);
    }

    _onLimitReached() {
        this._stopListening();

        const dialog = new Adw.AlertDialog({
            heading: 'Monthly Limit Reached',
            body: `You've reached your monthly usage limit of ${this._settings.monthlyLimitMinutes.toFixed(0)} minutes.\n\nTo continue, increase your limit in Preferences or wait until next month.`,
        });
        dialog.add_response('ok', 'OK');
        dialog.add_response('preferences', 'Open Preferences');
        dialog.set_default_response('ok');

        dialog.connect('response', (dialog, response) => {
            if (response === 'preferences') {
                this.get_application().activate_action('preferences', null);
            }
        });

        dialog.present(this);
    }

    _createMenu() {
        const menu = new Gio.Menu();
        menu.append('Preferences', 'app.preferences');
        menu.append('About Speakd', 'app.about');
        menu.append('Quit', 'app.quit');
        return menu;
    }

    vfunc_close_request() {
        // Clean up all services
        this._audioService.destroy();
        this._deepgramService.destroy();
        this._outputService.destroy();
        this._usageService.destroy();
        return super.vfunc_close_request();
    }
});
