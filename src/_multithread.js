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

// Short-lived result cache for the expensive, argument-less queries that several modules poll
// independently (e.g. toplist and cpuinfo both want `processes`, which shells out to ps and
// parses every process). A call made while a fresh-enough result exists, or while the same
// query is still in flight, reuses it instead of hitting the system again.
const CACHE_TTL = {
    processes: 2500,
    networkConnections: 2500,
    networkInterfaces: 2500,
    cpuTemperature: 2000,
    mem: 1000,
    currentLoad: 500
};
const cache = new Map();

function cached(type, run) {
    const ttl = CACHE_TTL[type];
    if (!ttl) return run();
    const hit = cache.get(type);
    const now = Date.now();
    if (hit && now - hit.time < ttl) return hit.promise;
    const entry = {time: now, promise: run()};
    cache.set(type, entry);
    entry.promise.catch(() => cache.delete(type));
    return entry.promise;
}

function reply(sender, id, res) {
    try {
        if (!sender.isDestroyed()) sender.send("systeminformation-reply-"+id, res);
    } catch(e) {
        // Window has been closed, ignore.
    }
}

// Ask the worker (or the main process while it is down) for one query, as a promise.
function query(type, arg) {
    if (worker === null) return si[type](arg);
    return new Promise(resolve => {
        const id = ++querySeq;
        pending.set(id, resolve);
        worker.postMessage({id, type, arg});
    });
}
let querySeq = 0;

function spawnWorker() {
    worker = utilityProcess.fork(require("path").join(__dirname, "_multithread-worker.js"), [], {
        serviceName: "eDEX-UI systeminformation"
    });

    worker.on("message", msg => {
        let resolve = pending.get(msg.id);
        pending.delete(msg.id);
        if (resolve) resolve(msg.res);
    });

    worker.on("exit", code => {
        signale.warn(`systeminformation worker exited (code ${code}), restarting`);
        // Requests in flight are lost; resolve them with null so callers don't hang.
        for (const [id, resolve] of pending) {
            pending.delete(id);
            resolve(null);
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

    let result;
    if (args.length > 1) {
        // Multi-argument calls stay on the main process, as before.
        result = si[type](...args);
    } else if (args.length === 0) {
        result = cached(type, () => query(type, undefined));
    } else {
        result = query(type, args[0]);
    }
    result.then(res => reply(e.sender, id, res)).catch(() => reply(e.sender, id, null));
});
