// Backend for the renderer's `window.si` proxy (see initSystemInformationProxy in _renderer.js).
//
// systeminformation calls are I/O bound (they shell out to ps, sensors, /proc, ...), so a single
// utility process is enough to keep them off the main process: every request is dispatched
// concurrently inside it. This replaces the previous cluster of N full Electron workers, which
// cost ~130MB RSS each for no extra throughput.
const {utilityProcess, ipcMain: ipc} = require("electron");
const signale = require("signale");
const si = require("systeminformation");

const pending = new Map();
let worker = null;

function spawnWorker() {
    worker = utilityProcess.fork(require("path").join(__dirname, "_multithread-worker.js"), [], {
        serviceName: "eDEX-UI systeminformation"
    });

    worker.on("message", msg => {
        let sender = pending.get(msg.id);
        pending.delete(msg.id);
        if (!sender) return;
        try {
            if (!sender.isDestroyed()) sender.send("systeminformation-reply-"+msg.id, msg.res);
        } catch(e) {
            // Window has been closed, ignore.
        }
    });

    worker.on("exit", code => {
        signale.warn(`systeminformation worker exited (code ${code}), restarting`);
        // Requests in flight are lost; answer them from the main process so callers don't hang.
        for (const [id, sender] of pending) {
            pending.delete(id);
            try {
                if (!sender.isDestroyed()) sender.send("systeminformation-reply-"+id, null);
            } catch(e) {
                // ignore
            }
        }
        worker = null;
        setTimeout(spawnWorker, 1000);
    });
}

spawnWorker();
signale.success("systeminformation worker ready");

ipc.on("systeminformation-call", (e, type, id, ...args) => {
    if (!si[type]) {
        signale.warn("Illegal request for systeminformation");
        return;
    }

    // Multi-argument calls and callback-style results stay on the main process, as before.
    if (args.length > 1 || worker === null) {
        si[type](...args).then(res => {
            try {
                if (!e.sender.isDestroyed()) e.sender.send("systeminformation-reply-"+id, res);
            } catch(err) {
                // Window has been closed, ignore.
            }
        });
        return;
    }

    pending.set(id, e.sender);
    worker.postMessage({id, type, arg: args[0]});
});
