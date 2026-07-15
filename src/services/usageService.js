import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

// Deepgram Nova-3 streaming pricing per minute
const PRICE_PER_MINUTE = 0.0077;

export const UsageService = GObject.registerClass({
    Signals: {
        'usage-updated': { param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE] }, // session, month
        'warning-threshold': { param_types: [GObject.TYPE_DOUBLE] }, // percentage
        'limit-reached': {},
    },
}, class UsageService extends GObject.Object {

    constructor(settings) {
        super();

        this._settings = settings;
        this._sessionMinutes = 0;
        this._warningShown = false;

        // Check for monthly reset on startup
        this._checkMonthlyReset();

        // Reset session usage
        this._settings.usageMinutesSession = 0;
    }

    _checkMonthlyReset() {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastReset = this._settings.usageResetDate;

        if (lastReset !== currentMonth) {
            console.log(`Monthly reset: ${lastReset} -> ${currentMonth}`);
            this._settings.usageMinutesMonth = 0;
            this._settings.usageResetDate = currentMonth;
        }
    }

    /**
     * Track audio data sent to Deepgram
     * @param {number} bytesLength - Length of audio buffer in bytes
     */
    trackAudio(bytesLength) {
        // Audio format: 16kHz, 16-bit mono = 32000 bytes/second
        const seconds = bytesLength / 32000;
        const minutes = seconds / 60;

        this._sessionMinutes += minutes;
        this._settings.usageMinutesSession = this._sessionMinutes;
        this._settings.usageMinutesMonth += minutes;

        // Check limits
        this._checkLimits();

        // Emit update signal
        this.emit('usage-updated', this._sessionMinutes, this._settings.usageMinutesMonth);
    }

    _checkLimits() {
        const limit = this._settings.monthlyLimitMinutes;
        if (limit <= 0) return; // No limit set

        const usage = this._settings.usageMinutesMonth;
        const percentage = usage / limit;
        const threshold = this._settings.limitWarningThreshold;

        // Check warning threshold
        if (percentage >= threshold && !this._warningShown) {
            this._warningShown = true;
            this.emit('warning-threshold', percentage);
        }

        // Check hard limit
        if (percentage >= 1.0 && this._settings.hardLimitEnabled) {
            this.emit('limit-reached');
        }
    }

    /**
     * Check if usage is at or over the limit
     * @returns {boolean}
     */
    isOverLimit() {
        const limit = this._settings.monthlyLimitMinutes;
        if (limit <= 0) return false;

        return this._settings.usageMinutesMonth >= limit && this._settings.hardLimitEnabled;
    }

    /**
     * Get formatted usage string for display
     * @returns {string}
     */
    getUsageText() {
        const session = this._sessionMinutes;
        const month = this._settings.usageMinutesMonth;
        const limit = this._settings.monthlyLimitMinutes;
        const cost = this.getEstimatedCost();

        let text = `${session.toFixed(1)} min this session`;

        if (limit > 0) {
            text += ` • ${month.toFixed(1)}/${limit.toFixed(0)} min this month`;
        } else {
            text += ` • ${month.toFixed(1)} min this month`;
        }

        text += ` (~$${cost.toFixed(3)})`;

        return text;
    }

    /**
     * Get usage percentage (0-1) for progress bar
     * @returns {number}
     */
    getUsagePercentage() {
        const limit = this._settings.monthlyLimitMinutes;
        if (limit <= 0) return 0;

        return Math.min(this._settings.usageMinutesMonth / limit, 1.0);
    }

    /**
     * Get estimated cost for current month
     * @returns {number}
     */
    getEstimatedCost() {
        return this._settings.usageMinutesMonth * PRICE_PER_MINUTE;
    }

    /**
     * Get session usage in minutes
     * @returns {number}
     */
    get sessionMinutes() {
        return this._sessionMinutes;
    }

    /**
     * Get monthly usage in minutes
     * @returns {number}
     */
    get monthlyMinutes() {
        return this._settings.usageMinutesMonth;
    }

    /**
     * Reset warning flag (e.g., after user dismisses warning)
     */
    resetWarning() {
        this._warningShown = false;
    }

    /**
     * Reset session counter
     */
    resetSession() {
        this._sessionMinutes = 0;
        this._settings.usageMinutesSession = 0;
        this.emit('usage-updated', 0, this._settings.usageMinutesMonth);
    }

    destroy() {
        // Save final session usage
        this._settings.usageMinutesSession = this._sessionMinutes;
    }
});
