// Shared animation clock for every module that repaints continuously (globe, smoothie charts).
//
// Each compositor frame costs the same on the GPU process whether it repaints an 8px canvas or
// the whole window, so the cheapest thing to do on weak iGPUs is to produce as few frames as
// possible. Instead of letting every module run its own requestAnimationFrame loop at its own
// rate (which spreads their repaints over different vsyncs), every animated module registers a
// task here and all tasks run inside the same frame, at a capped, configurable rate.
class UITicker {
    constructor(fps) {
        this.tasks = new Map();
        this._frame = 0;
        this._last = 0;
        this._raf = null;
        this._loop = this._loop.bind(this);

        this.setFps(fps);

        // Don't burn frames while the window is not shown at all (backgroundThrottling is off
        // in _boot.js so requestAnimationFrame would otherwise keep firing).
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this._stop();
            } else {
                this._start();
            }
        });
    }

    setFps(fps) {
        fps = Number(fps);
        if (!Number.isFinite(fps) || fps <= 0) fps = 15;
        this.fps = Math.min(60, Math.max(1, fps));
        // Leave ~1ms of slack so a 16.7ms vsync is not skipped because of timer jitter.
        this._minDelta = 1000 / this.fps - 1;
    }

    // Run fn every `every` ticks (1 = at the ticker's full rate, 2 = half rate, ...).
    add(id, fn, every = 1) {
        this.tasks.set(id, {fn, every: Math.max(1, Math.round(every))});
        this._start();
    }

    remove(id) {
        this.tasks.delete(id);
        if (this.tasks.size === 0) this._stop();
    }

    _start() {
        if (this._raf === null && this.tasks.size > 0 && !document.hidden) {
            this._raf = requestAnimationFrame(this._loop);
        }
    }

    _stop() {
        if (this._raf !== null) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    _loop(now) {
        this._raf = null;
        if (now - this._last >= this._minDelta) {
            this._last = now;
            this._frame++;
            this.tasks.forEach((task, id) => {
                if (this._frame % task.every !== 0) return;
                try {
                    task.fn(now);
                } catch(e) {
                    // A module that throws (typically mid-reload) must not take the others down.
                    console.warn(`UITicker: task "${id}" threw`, e);
                }
            });
        }
        this._start();
    }
}

module.exports = {
    UITicker
};
