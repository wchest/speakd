import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk?version=4.0';

import { TypingPortalService } from './typingPortalService.js';

export const OutputService = GObject.registerClass({
    Signals: {
        'output-complete': { param_types: [GObject.TYPE_STRING] },
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class OutputService extends GObject.Object {

    constructor(settings) {
        super();
        this._settings = settings;
        this._typeMethodWarned = false;
        this._typingPortal = new TypingPortalService(settings);
        this._detectEnvironment();
    }

    _detectEnvironment() {
        this._isGnome = GLib.getenv('XDG_CURRENT_DESKTOP')?.toLowerCase().includes('gnome') || false;
        this._isWayland = GLib.getenv('XDG_SESSION_TYPE') === 'wayland';
    }

    async output(text, sessionText = '') {
        if (!text || text.trim().length === 0) {
            return;
        }

        // Add trailing space so consecutive utterances flow together
        const outputText = text + ' ';
        // Clipboard holds the whole session so a paste never loses earlier
        // phrases; typing inserts only the new segment
        const clipboardText = (sessionText || text) + ' ';
        const mode = this._settings?.outputMode || 'clipboard';

        try {
            if (mode === 'clipboard' || mode === 'both') {
                await this.copyToClipboard(clipboardText);
            }

            if (mode === 'insert' || mode === 'both') {
                await this.typeText(outputText);
            }

            this.emit('output-complete', text);
        } catch (error) {
            console.error('Output failed:', error);
            this.emit('error', error.message);

            // Fallback to clipboard if typing fails
            if (mode === 'insert') {
                try {
                    await this.copyToClipboard(clipboardText);
                    console.log('Fell back to clipboard');
                } catch (clipError) {
                    console.error('Clipboard fallback also failed:', clipError);
                }
            }
        }
    }

    async copyToClipboard(text) {
        // Try wl-copy first (more reliable on Wayland)
        try {
            await this._runCommand(['wl-copy', '--', text]);
            console.log('Copied to clipboard via wl-copy');
            return;
        } catch (error) {
            console.log('wl-copy failed, trying GDK clipboard');
        }

        // Fallback to GDK clipboard
        try {
            const display = Gdk.Display.get_default();
            if (display) {
                const clipboard = display.get_clipboard();
                clipboard.set(text);
                console.log('Copied to clipboard via GDK');
            }
        } catch (error) {
            throw new Error(`Clipboard failed: ${error.message}`);
        }
    }

    async typeText(text) {
        // Try the RemoteDesktop portal first — the only method that works on
        // GNOME Wayland (one-time permission dialog, then silent)
        try {
            await this._typingPortal.typeText(text);
            console.log('Text typed via RemoteDesktop portal');
            return;
        } catch (portalError) {
            console.log('Portal typing unavailable:', portalError.message);
        }

        // Try wtype (wlroots compositors like Sway, Hyprland)
        try {
            await this._runCommand(['wtype', '--', text]);
            console.log('Text typed via wtype');
            return;
        } catch (wtypeError) {
            // wtype doesn't work on GNOME - try alternatives
        }

        // Try dotool (works everywhere, no daemon, but needs manual install)
        try {
            await this._runCommandWithStdin(['dotool'], `type ${text}`);
            console.log('Text typed via dotool');
            return;
        } catch (dotoolError) {
            // dotool not installed or no permissions
        }

        // Try ydotool (works on GNOME but requires ydotoold daemon)
        try {
            await this._runCommand(['ydotool', 'type', '--', text]);
            console.log('Text typed via ydotool');
            return;
        } catch (ydotoolError) {
            // ydotool not working
        }

        // Nothing worked - show error once
        if (!this._typeMethodWarned) {
            this._typeMethodWarned = true;
            const msg = this._isGnome && this._isWayland
                ? 'Type at Cursor needs portal permission (or dotool/ydotool). Using clipboard instead.'
                : 'Type at Cursor not available. Using clipboard instead.';
            throw new Error(msg);
        }
        throw new Error('Type at Cursor not available');
    }

    _runCommandWithStdin(argv, input) {
        return new Promise((resolve, reject) => {
            try {
                const proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(input, null, (proc, result) => {
                    try {
                        const [success, stdout, stderr] = proc.communicate_utf8_finish(result);
                        const exitStatus = proc.get_exit_status();

                        if (exitStatus === 0) {
                            resolve(stdout);
                        } else {
                            reject(new Error(stderr || `Command failed with exit code ${exitStatus}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    _runCommand(argv) {
        return new Promise((resolve, reject) => {
            try {
                const proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        const [success, stdout, stderr] = proc.communicate_utf8_finish(result);
                        const exitStatus = proc.get_exit_status();

                        if (exitStatus === 0) {
                            resolve(stdout);
                        } else {
                            reject(new Error(stderr || `Command failed with exit code ${exitStatus}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    destroy() {
        this._typingPortal.destroy();
    }
});
