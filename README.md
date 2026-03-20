# MoleSurface

> A native macOS UI wrapper for [tw93/mole](https://github.com/tw93/mole) — the all-in-one Mac maintenance tool.

MoleSurface gives Mole a full graphical interface while making **zero changes** to the Mole source. When Mole releases a new version, MoleSurface picks it up automatically — no code updates required.

---

## Features

| Page | Mole command | What it shows |
|------|-------------|---------------|
| Dashboard | `mo status --json` | Live CPU, memory, disk, network, processes |
| Disk Analyze | native `du` scan | Sorted disk usage with folder drill-down |
| Clean | `mo clean` | Streaming cache and temp file removal |
| Uninstall | `mo uninstall` | App removal with dependency tracking |
| Optimize | `mo optimize` | System performance tuning |
| Purge | `mo purge` | Build artifact and memory cleanup |
| Installer | `mo installer` | Leftover installer file management |
| Settings | — | Mole version, one-click update |

**Mole is installed and updated entirely from within the UI** — no Homebrew, no terminal required.

---

## Architecture

```
MoleSurface (Tauri v2 + React + TypeScript + Tailwind CSS)
     │
     │  spawns subprocess
     ▼
~/.molesurface/bin/mo   ←  downloaded from tw73/mole GitHub releases
```

- MoleSurface **never modifies** Mole source code
- Mole binary lives at `~/.molesurface/bin/mo`
- Version is tracked in `~/.molesurface/version`
- Updates pull `binaries-darwin-{arm64|amd64}.tar.gz` from the latest GitHub release
- Theme automatically follows macOS system dark/light mode

---

## Project Structure

```
MoleSurface/
├── .github/
│   └── workflows/
│       └── ci.yml               # Type check + cargo check on every push/PR
├── src/
│   ├── App.tsx                  # Root: theme detection, routing, mole-ready gate
│   ├── lib/
│   │   ├── github.ts            # GitHub releases API, version comparison
│   │   ├── mole.ts              # Mole path helpers, install check, version file
│   │   └── theme.ts             # Dark/light color tokens, system theme hook
│   ├── components/
│   │   ├── Sidebar.tsx          # macOS-style navigation sidebar
│   │   ├── TitleBar.tsx         # Draggable title bar (native traffic-light buttons)
│   │   ├── Terminal.tsx         # Auto-scrolling streaming output display
│   │   └── StreamPage.tsx       # Reusable run-and-stream page wrapper
│   └── pages/
│       ├── Install.tsx          # First-run: download + extract Mole binary
│       ├── Dashboard.tsx        # System status gauges
│       ├── Analyze.tsx          # Disk usage with drill-down navigation
│       ├── Clean.tsx
│       ├── Uninstall.tsx
│       ├── Optimize.tsx
│       ├── Purge.tsx
│       ├── InstallerPage.tsx
│       └── Settings.tsx         # Version check + update
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # Tauri commands: check_arch, get_home_dir, scan_disk…
│   │   └── main.rs
│   ├── capabilities/
│   │   └── default.json         # Permission declarations (fs, http)
│   ├── icons/
│   └── tauri.conf.json          # Window config (vibrancy, overlay titlebar)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Xcode CLT | latest | `xcode-select --install` |

---

## Development

```bash
# Install frontend dependencies
npm install

# Start dev server (hot-reload frontend + Rust backend)
npm run tauri dev
```

The first run compiles the Rust backend (~2–3 min). Subsequent runs are fast.

---

## Building

```bash
# Type check + Vite bundle
npm run build

# Rust compile check
cargo check --manifest-path src-tauri/Cargo.toml

# Build .app and .dmg for your current machine's architecture
npm run tauri build
# Output: src-tauri/target/release/bundle/dmg/MoleSurface_*.dmg
```

---

## CI

Every push and pull request to `main` runs:

```
push / PR → macos-14
  ├── npm ci
  ├── npm run build     (TypeScript + Vite)
  └── cargo check       (Rust)
```

---

## Mole Updates

MoleSurface tracks Mole entirely at runtime:

1. On first launch → detects no `~/.molesurface/bin/mo` → shows Install screen
2. In Settings → **Check for Updates** hits the GitHub Releases API
3. If a newer version is found → **Update** downloads the correct tarball and replaces the binary
4. Version is written to `~/.molesurface/version` for comparison

```
GitHub Releases API
  └── binaries-darwin-arm64.tar.gz   (Apple Silicon)
  └── binaries-darwin-amd64.tar.gz   (Intel)
```

No Homebrew involved at any stage.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines. The short version:

1. Fork and clone
2. `npm install && npm run tauri dev`
3. Keep the **zero Mole source changes** constraint
4. Open a PR — CI will validate TypeScript and Rust

---

## License

MIT — same as [tw73/mole](https://github.com/tw73/mole/blob/main/LICENSE).
