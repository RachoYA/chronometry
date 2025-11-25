class GameLoop {
    constructor(updateFn, drawFn) {
        this.updateFn = updateFn;
        this.drawFn = drawFn;
        this.lastTime = 0;
        this.isRunning = false;
        this.rafId = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
    }

    loop(timestamp) {
        if (!this.isRunning) return;

        const dt = (timestamp - this.lastTime) / 1000; // Delta time in seconds
        this.lastTime = timestamp;

        // Cap dt to prevent huge jumps if tab is inactive
        const safeDt = Math.min(dt, 0.1);

        this.updateFn(safeDt);

        // We don't pass context here, the renderer handles its own context
        this.drawFn();

        this.rafId = requestAnimationFrame((t) => this.loop(t));
    }
}
