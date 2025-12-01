import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { AudioService } from './services/audioService.js';
import { DeepgramService } from './services/deepgramService.js';
import { OutputService } from './services/outputService.js';

export const SpeakdWindow = GObject.registerClass(
class SpeakdWindow extends Adw.ApplicationWindow {

    constructor(params = {}) {
        const { settings, ...parentParams } = params;
        super(parentParams);

        this._settings = settings;
        this._audioService = new AudioService(settings);
        this._deepgramService = new DeepgramService(settings);
        this._outputService = new OutputService(settings);

        this._isListening = false;
        this._currentTranscript = '';
        this._finalTranscript = '';

        this.set_default_size(400, 500);
        this.set_title('Speakd');

        this._buildUI();
        this._connectSignals();
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

        // Status icon
        this._statusIcon = new Gtk.Image({
            icon_name: 'audio-input-microphone-symbolic',
            pixel_size: 96,
            css_classes: ['dim-label'],
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
        });

        // Audio data -> send to Deepgram
        this._audioService.connect('audio-data', (service, data) => {
            if (this._deepgramService.isConnected) {
                this._deepgramService.sendAudio(data);
            }
        });

        // Audio errors
        this._audioService.connect('error', (service, message) => {
            this._showError(`Audio: ${message}`);
        });

        // Deepgram connection events
        this._deepgramService.connect('connected', () => {
            this._onDeepgramConnected();
        });

        this._deepgramService.connect('disconnected', () => {
            console.log('Deepgram disconnected');
            if (this._isListening) {
                this._descriptionLabel.set_label('Reconnecting...');
            }
        });

        // Deepgram transcript events
        this._deepgramService.connect('transcript', (service, text, isFinal, speechFinal) => {
            this._handleTranscript(text, isFinal, speechFinal);
        });

        // Deepgram errors
        this._deepgramService.connect('error', (service, message) => {
            this._showError(`Deepgram: ${message}`);
        });

        // Output events
        this._outputService.connect('output-complete', (service, text) => {
            this._showToast('Text copied to clipboard');
        });

        this._outputService.connect('error', (service, message) => {
            this._showError(`Output: ${message}`);
        });
    }

    _handleTranscript(text, isFinal, speechFinal) {
        if (text === '' && isFinal && speechFinal) {
            // Utterance end - output the final transcript
            if (this._currentTranscript.trim()) {
                this._outputService.output(this._currentTranscript.trim());
                this._finalTranscript += this._currentTranscript.trim() + '\n';
                this._currentTranscript = '';
                this._updateTranscriptDisplay();
            }
            return;
        }

        if (isFinal) {
            // Add to current transcript
            this._currentTranscript += text + ' ';

            if (speechFinal) {
                // Natural end of speech - output now
                this._outputService.output(this._currentTranscript.trim());
                this._finalTranscript += this._currentTranscript.trim() + '\n';
                this._currentTranscript = '';
            }
        }

        this._updateTranscriptDisplay(isFinal ? '' : text);
    }

    _updateTranscriptDisplay(interimText = '') {
        let display = this._finalTranscript + this._currentTranscript;
        if (interimText) {
            display += `<span alpha="50%">${interimText}</span>`;
        }
        this._transcriptLabel.set_markup(display || '<span alpha="50%">Transcript will appear here...</span>');

        // Auto-scroll to bottom (use idle to let GTK recalculate layout first)
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            const vadj = this._transcriptScroll.get_vadjustment();
            vadj.set_value(vadj.get_upper());
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
        console.log('Start listening clicked');

        // Check for API key
        if (!this._settings?.hasApiKey) {
            console.log('No API key configured');
            this._showError('Please configure your Deepgram API key in Preferences');
            return;
        }

        console.log('API key found, connecting...');

        // Update UI to connecting state
        this._isListening = true;
        this._statusIcon.set_css_classes(['accent']);
        this._statusLabel.set_label('Connecting...');
        this._descriptionLabel.set_label('Connecting to Deepgram...');
        this._toggleButton.set_label('Stop');
        this._toggleButton.set_css_classes(['destructive-action', 'pill']);

        // Clear previous transcripts
        this._currentTranscript = '';
        this._finalTranscript = '';
        this._updateTranscriptDisplay();

        // Connect to Deepgram - audio will start when connected signal fires
        this._deepgramService.start();
    }

    _onDeepgramConnected() {
        console.log('Deepgram connected, now starting audio...');

        if (!this._isListening) {
            return;  // User stopped while connecting
        }

        try {
            // Start audio capture
            const deviceId = this._settings?.inputDevice || null;
            console.log('Calling audioService.start with deviceId:', deviceId);
            this._audioService.start(deviceId);
            console.log('Audio service started');

            this._statusLabel.set_label('Listening...');
            this._descriptionLabel.set_label('Speak now');
        } catch (error) {
            console.error('Failed to start audio:', error);
            this._showError(`Failed to start audio: ${error.message}`);
            this._stopListening();
        }
    }

    _stopListening() {
        // Stop audio first
        this._audioService.stop();

        // Finalize and disconnect Deepgram
        this._deepgramService.finalize();
        this._deepgramService.disconnect();

        this._isListening = false;
        this._resetUI();
    }

    _resetUI() {
        this._levelBar.set_value(0);
        this._statusIcon.set_css_classes(['dim-label']);
        this._statusLabel.set_label('Ready');
        this._descriptionLabel.set_label('Click the button below to start listening');
        this._toggleButton.set_label('Start Listening');
        this._toggleButton.set_css_classes(['suggested-action', 'pill']);
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
        return super.vfunc_close_request();
    }
});
