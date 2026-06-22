<p align="center">
  <img alt="eDEX-UI" src="media/logo.png">
  <br><br>
  <strong>A community modernization fork of <a href="https://github.com/GitSquared/edex-ui">eDEX-UI</a></strong>
  <br>
  <em>The sci-fi terminal emulator & system monitor — revived for a modern stack.</em>
  <br><br>
  <img alt="Electron 33" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white">
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
| Electron | 12 | **33** |
| `node-pty` (terminal backend) | 0.10 | **1.1** |
| Terminal UI | `xterm` 4 | **`@xterm/*` v6** (scoped packages) |
| Remote module | `@electron/remote` 1 | **2** (with the v2 `enable()` API) |
| Build tooling | `electron-builder` 22, `electron-rebuild` | **`electron-builder` 26, `@electron/rebuild` 4** |
| System monitor | `systeminformation` 5.9 | **5.31** |

Plus runtime fixes required by the above: an `electron.remote` compatibility shim, ESM-aware loading of
the ligatures addon, a more tolerant RAM-watcher, and resilient config-file reads. See
[Technical notes](#technical-notes) for the interesting details.

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
