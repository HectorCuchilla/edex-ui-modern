<p align="center">
  <img alt="eDEX-UI" src="media/logo.png">
  <br><br>
  <strong>A community modernization fork of <a href="https://github.com/GitSquared/edex-ui">eDEX-UI</a></strong>
  <br>
  <em>The sci-fi terminal emulator & system monitor — revived for a modern stack.</em>
  <br><br>
  <img alt="Electron 44" src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white">
  <img alt="License GPL-3.0" src="https://img.shields.io/badge/License-GPL--3.0-blue">
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey">
</p>

---

> [!IMPORTANT]
> This is a **community-maintained fork** of [GitSquared/eDEX-UI](https://github.com/GitSquared/edex-ui),
> which was archived in October 2021. It is **not affiliated with or endorsed by** the original author.
> All credit for eDEX-UI goes to **Gabriel "Squared" Saillard** and the original contributors.
> "eDEX-UI" is the upstream name, used here for attribution only; a distinct fork name is still to be chosen.

eDEX-UI is a fullscreen, cross-platform terminal emulator and system monitor that looks and feels like
a sci-fi computer interface, heavily inspired by the **TRON Legacy** movie effects. It wraps a real
terminal (so you can use it for actual work) in a futuristic UI with live CPU/RAM/network monitoring,
an on-screen keyboard, a file browser, and a network globe.

For the full feature tour, screenshots, and FAQ, see the original docs: **[README.upstream.md](README.upstream.md)**.

## Why this fork exists

The upstream project worked beautifully but is **frozen on a 2021 Electron/Node stack**. As operating
systems moved on, the prebuilt binaries increasingly fail to run — most painfully on **Apple Silicon**,
where the native terminal module can't load. No successor project exists.

This fork is a focused **platform modernization**: bump the toolchain, rebuild the native module against
a current Electron ABI, and migrate the renamed `xterm` packages — so eDEX builds and runs on today's
systems again.

## What's new in this fork

| Area | Upstream (2.2.8) | This fork |
|------|------------------|-----------|
| Electron | 12 | **44** |
| `node-pty` (terminal backend) | 0.10 | **1.1** |
| Terminal UI | `xterm` 4 | **`@xterm/*` v6** (scoped packages) |
| Remote module | `@electron/remote` 1 | **2** (with the v2 `enable()` API) |
| Build tooling | `electron-builder` 22, `electron-rebuild` | **`electron-builder` 26, `@electron/rebuild` 4** |
| System monitor | `systeminformation` 5.9 | **5.31** |

Plus runtime fixes required by the above: an `electron.remote` compatibility shim, ESM-aware loading of
the ligatures addon, a more tolerant RAM-watcher, and resilient config-file reads. See
[Technical notes](#technical-notes) for the interesting details.

On top of the platform work, this fork also cuts eDEX's idle resource usage substantially without
changing how it looks — see [Resource usage optimizations](#resource-usage-optimizations).

## Quick start

If the app is already built (native module compiled), just launch it:

```sh
npm run start
```

## Build from source

**Prerequisites** (needed to compile the native `node-pty` module):

- **Node.js 20+** and a recent npm
- **Python 3** on your `PATH` (for `node-gyp`)
- A C/C++ toolchain:
  - **macOS** → Xcode command line tools (`xcode-select --install`)
  - **Linux** → `build-essential` (gcc/make)
  - **Windows** → the **"Desktop development with C++"** workload from
    [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
    The old `windows-build-tools` npm package is **not** used, and you do **not** need the
    Spectre-mitigated libraries (this fork patches that requirement out — see below).

**Install & run:**

```sh
# Linux / macOS
npm run install-linux
npm run start

# Windows
npm run install-windows
npm run start
```

**Build distributable binaries** (host OS only, due to the native module):

```sh
npm install
npm run build-linux   # or build-windows / build-darwin
```

## Technical notes

A few non-obvious things this fork had to solve, in case they help others reviving Electron apps:

- **`node-pty` + Spectre libraries.** `node-pty` 1.1's `binding.gyp` requests Spectre-mitigated
  compilation, which needs an optional Visual Studio component (`MSB8040` if absent). Rather than
  require that component, a [patch-package](https://www.npmjs.com/package/patch-package) patch
  (`src/patches/node-pty+1.1.0.patch`) disables Spectre mitigation in both `binding.gyp` and the
  bundled `winpty.gyp`. It auto-applies on every install via a `postinstall` hook.
- **`@electron/remote` v2.** `remote` was removed from Electron core (v14+). The renderer adds a
  compatibility shim (`electron.remote = require("@electron/remote")`) so the many existing
  `electron.remote.*` call sites keep working, and the main process calls `enable(win.webContents)`.
- **Ligatures addon (ESM).** `@xterm/addon-ligatures` ships ESM-only, so it's loaded via a dynamic
  `import()` of an absolute `file://` URL (resolved with Node) and enabled with the xterm
  `allowProposedApi` option.

## Resource usage optimizations

eDEX is a dashboard that never stops moving, and upstream paid for that with a lot of idle CPU. Profiled
on a low-end laptop (4-core Celeron J4125, Intel UHD 600 iGPU, X11) the app burned **~95% of a core while
idle** and held **~1.3 GB** across 11 Electron processes. The following changes bring that down to
**~54% of a core and ~1.1 GB across 9 processes**, with the UI looking and behaving exactly as before.

| Process | Before | After |
|---------|-------:|------:|
| GPU process | 45.6% | 25.0% |
| Renderer (UI) | 31.7% | 19.6% |
| `systeminformation` backend | 13.3% (3 workers) | 7.0% (1 worker) |
| Main | 3.9% | 2.2% |
| **Total** | **~95%** | **~54%** |

*(10-second `pidstat` averages, same session, dashboard idle.)*

### What was changed

- **One shared animation clock (`src/classes/uiTicker.class.js`).** On an integrated GPU every
  composited frame costs about the same whether it repaints an 8-pixel canvas or the whole window,
  so what matters is *how many frames per second the page produces*, not how much each one draws.
  Upstream let the network globe and the four smoothie charts (CPU ×2, network ×2) each run their own
  `requestAnimationFrame` loop at different rates, spreading repaints over different vsyncs. They now
  all register with a single capped ticker: the globe ticks at the full rate and the charts repaint at
  half of it, inside the same frame. The ticker pauses while the window is hidden.
- **Saner polling.** Every module's `setInterval` goes through `window.pollInterval()` and the
  defaults were relaxed where nothing visible changes (CPU load 0.5 → 1 s, CPU temperature 2 → 5 s,
  CPU speed 1 → 2 s, RAM 1.5 → 2 s, network status 2 → 3 s, top processes 2 → 3 s, battery 3 → 10 s,
  globe location 1 → 2 s).
- **A single `systeminformation` worker (`src/_multithread.js`, `src/_multithread-worker.js`).**
  Upstream forked a `cluster` of *N − 1* full Electron processes (~130 MB RSS each) to run
  `systeminformation` queries off the main process. Those queries are I/O bound (they shell out to
  `ps`, `ss`, read `/proc`…), so one Electron `utilityProcess` handles them concurrently with the same
  IPC interface. It restarts itself if it dies and answers in-flight requests with `null` so callers
  never hang.
- **Result cache for expensive queries.** `processes` (a full `ps` run) was requested independently by
  the top-processes list and by the CPU "tasks" counter; `networkConnections` (`ss`) by the globe.
  The backend now keeps a short-lived cache (0.5–2.5 s depending on the query) and dedupes calls that
  are still in flight, so the OS is asked once per poll cycle.
- **No `sh + ps` per terminal tick (Linux).** To label the shell tab with the running program, the
  main process spawned `ps -g … | tail -1` every second that saw terminal output. It now reads the
  tty's foreground process group from `/proc/<pid>/stat` and its name from `/proc/<tpgid>/comm`,
  falling back to `ps` if procfs is unavailable. As a side effect the tab shows the actual foreground
  job instead of the newest process in the session, so it no longer flickers while a program spawns
  helpers.
- **pdf.js on demand.** The ~400 KB PDF viewer library is loaded the first time a PDF is opened from
  the file browser instead of at boot.

### Tuning knobs

Two new keys in `settings.json` (also editable from the in-app settings editor, `Ctrl+Shift+S`):

| Key | Default | Effect |
|-----|---------|--------|
| `uiFps` | `15` | Maximum frames per second for the globe and charts. `10` saves a few more GPU % at the cost of a slightly choppier globe. |
| `pollRate` | `1` | Multiplier applied to every system-stats polling interval (`2` = everything polls half as often). |

### Things deliberately left alone

- The terminal itself: xterm's WebGL renderer is already the cheapest option.
- Cursor blink, GeoLite2-City in memory (~66 MB, needed for the globe's connection pins) and the
  chart/globe visuals — all would change the look and feel.
- Chromium GPU flags: with GPU rasterization already forced they made no measurable difference.

## Status

- ✅ **Windows** — builds and runs (verified: terminal spawns a real shell, monitors populate, ligatures on)
- ⏳ **macOS (incl. Apple Silicon) / Linux** — expected to build with the same toolchain; not yet verified here

## Contributing

Issues and PRs are welcome. Please keep changes focused and aligned with the goal of keeping eDEX
alive on modern systems.

## Credits

All original work by **[Squared](https://github.com/GitSquared)** and the eDEX-UI contributors:

- **[PixelyIon](https://github.com/PixelyIon)** — early Windows compatibility help
- **[IceWolf](https://soundcloud.com/iamicewolf)** — sound effects (v2.1.x+)
- **[Seena](https://github.com/seenaburns)** — the original [DEX-UI](https://github.com/seenaburns/dex-ui) that inspired the project

This fork only modernizes the build/runtime; the design and implementation are theirs.

## License

[GPL-3.0](LICENSE) — same as upstream. If you fork this further, keep the GPL-3.0 license, state that
your fork is based on eDEX-UI but **not affiliated with or endorsed by** the original author, and do
not use the "eDEX-UI" name or logo for your distribution.
