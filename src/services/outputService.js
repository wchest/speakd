import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk?version=4.0';

export const OutputService = GObject.registerClass({
    Signals: {
        'output-complete': { param_types: [GObject.TYPE_STRING] },
        'error': { param_types: [GObject.TYPE_STRING] },
    },
}, class OutputService extends GObject.Object {

    constructor(settings) {
        super();
        this._settings = settings;
    }

    async output(text) {
        if (!text || text.trim().length === 0) {
            return;
        }

        const mode = this._settings?.outputMode || 'clipboard';

        try {
            if (mode === 'clipboard' || mode === 'both') {
                await this.copyToClipboard(text);
            }

            if (mode === 'insert' || mode === 'both') {
                await this.typeText(text);
            }

            this.emit('output-complete', text);
        } catch (error) {
            console.error('Output failed:', error);
            this.emit('error', error.message);

            // Fallback to clipboard if typing fails
            if (mode === 'insert') {
                try {
                    await this.copyToClipboard(text);
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
        // Use wtype for Wayland text injection
        try {
            await this._runCommand(['wtype', '--', text]);
            console.log('Text typed via wtype');
        } catch (error) {
            // Try with delay for problematic applications
            try {
                await this._runCommand(['wtype', '-d', '10', '--', text]);
                console.log('Text typed via wtype with delay');
            } catch (delayError) {
                throw new Error(`Text injection failed: ${error.message}`);
            }
        }
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
        // Nothing to clean up
    }
});
