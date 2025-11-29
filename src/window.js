import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { AudioService } from './services/audioService.js';

export const VoxWindow = GObject.registerClass(
class VoxWindow extends Adw.ApplicationWindow {

    constructor(params = {}) {
        const { settings, ...parentParams } = params;
        super(parentParams);

        this._settings = settings;
        this._audioService = new AudioService(settings);
        this._isListening = false;

        this.set_default_size(400, 500);
        this.set_title('Vox');

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

        // Spacer
        const spacer = new Gtk.Box({ vexpand: true });
        mainBox.append(spacer);

        // Device info
        this._deviceLabel = new Gtk.Label({
            label: 'No device selected',
            css_classes: ['dim-label', 'caption'],
            halign: Gtk.Align.CENTER,
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

        this.set_content(toolbarView);

        // Update device label
        this._updateDeviceLabel();
    }

    _connectSignals() {
        // Audio level updates
        this._audioService.connect('audio-level', (service, level) => {
            this._levelBar.set_value(level);
        });

        // Audio data (for future use with transcription)
        this._audioService.connect('audio-data', (service, data) => {
            // Will be used for transcription in next session
        });

        // Errors
        this._audioService.connect('error', (service, message) => {
            this._showError(message);
        });

    }

    _toggleListening() {
        if (this._isListening) {
            this._stopListening();
        } else {
            this._startListening();
        }
    }

    _startListening() {
        try {
            const deviceId = this._settings?.inputDevice || null;
            this._audioService.start(deviceId);

            this._isListening = true;
            this._statusIcon.set_css_classes(['accent']);
            this._statusLabel.set_label('Listening...');
            this._descriptionLabel.set_label('Speak now - audio is being captured');
            this._toggleButton.set_label('Stop Listening');
            this._toggleButton.set_css_classes(['destructive-action', 'pill']);
        } catch (error) {
            this._showError(`Failed to start: ${error.message}`);
        }
    }

    _stopListening() {
        this._audioService.stop();

        this._isListening = false;
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
        const toast = new Adw.Toast({
            title: message,
            timeout: 5,
        });

        // Get toast overlay - need to add one
        this.add_toast(toast);
    }

    _createMenu() {
        const menu = new Gio.Menu();
        menu.append('Preferences', 'app.preferences');
        menu.append('About Vox', 'app.about');
        menu.append('Quit', 'app.quit');
        return menu;
    }

    vfunc_close_request() {
        // Clean up audio service
        this._audioService.destroy();
        return super.vfunc_close_request();
    }
});
