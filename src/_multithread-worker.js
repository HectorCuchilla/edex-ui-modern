// Electron utility process hosting systeminformation, see _multithread.js.
const si = require("systeminformation");

process.parentPort.on("message", e => {
    const {id, type, arg} = e.data;
    if (typeof si[type] !== "function") {
        process.parentPort.postMessage({id, res: null});
        return;
    }
    si[type](arg).then(res => {
        process.parentPort.postMessage({id, res});
    }).catch(() => {
        process.parentPort.postMessage({id, res: null});
    });
});
