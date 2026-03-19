# MoleSurface

> A native macOS UI wrapper for [tw93/mole](https://github.com/tw93/mole) — the all-in-one Mac maintenance tool.

MoleSurface gives Mole a full graphical interface while making **zero changes** to the Mole source. When Mole releases a new version, MoleSurface picks it up automatically — no code updates required.

---

## Features

| Page | Mole command | What it shows |
|------|-------------|---------------|
| Dashboard | `mo status --json` | Live CPU, memory, and disk gauges |
| Disk Analyze | `mo analyze --json` | Sorted disk usage breakdown |
| Clean | `mo clean` | Streaming cache and temp file removal |
| Uninstall | `mo uninstall` | App removal with dependency tracking |
| Optimize | `mo optimize` | System performance tuning |
| Purge | `mo purge` | Build artifact cleanup |
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
~/.molesurface/bin/mo   ←  downloaded from tw93/mole GitHub releases
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
├── .claude/
│   ├── agents/                  # Claude Code agent definitions
│   │   ├── release-validator.md
│   │   └── mole-compat-check.md
│   ├── commands/                # Claude Code slash commands
│   │   ├── build.md
│   │   ├── check.md
│   │   └── release.md
│   └── CLAUDE.md                # Project instructions for Claude
├── .github/
│   └── workflows/
│       ├── ci.yml               # Type check + cargo check on every push/PR
│       └── release.yml          # Build & publish .dmg on git tags
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
│       ├── Analyze.tsx          # Disk usage list
│       ├── Clean.tsx
│       ├── Uninstall.tsx
│       ├── Optimize.tsx
│       ├── Purge.tsx
│       ├── InstallerPage.tsx
│       └── Settings.tsx         # Version check + update
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # Tauri commands: check_arch, get_home_dir
│   │   └── main.rs
│   ├── capabilities/
│   │   └── default.json         # Permission declarations (fs, shell, http)
│   ├── icons/                   # App icons (generated)
│   └── tauri.conf.json          # Window config (frameless, vibrancy, overlay titlebar)
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

### Type check only

```bash
npm run build          # TypeScript + Vite
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

---

## Building a Release

### Local build

```bash
# Build .dmg for your current machine's architecture
npm run tauri build
# Output: src-tauri/target/release/bundle/dmg/MoleSurface_*.dmg
```

### GitHub release (recommended)

Tag a commit to trigger the automated CI pipeline:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build separate `.dmg` files for both Apple Silicon and Intel, then publish them as a GitHub release automatically.

---

## CI/CD

### `ci.yml` — runs on every push and pull request

```
push / PR → macos-14
  ├── npm ci
  ├── npm run build     (TypeScript + Vite)
  └── cargo check       (Rust)
```

Catches type errors and compilation failures before merge.

### `release.yml` — runs on `v*` tags

```
git tag v*  →  parallel jobs:
  ├── macos-14 (Apple Silicon / aarch64)
  │     └── tauri-apps/tauri-action → MoleSurface_*_aarch64.dmg
  └── macos-13 (Intel / x86_64)
        └── tauri-apps/tauri-action → MoleSurface_*_x64.dmg
          ↓
    GitHub Release (auto-created with both .dmg assets)
```

No code-signing is configured by default. To enable Apple notarization, add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` to your repository secrets and pass them to `tauri-action`.

---

## Mole Updates

MoleSurface tracks Mole entirely at runtime:

1. On first launch → detects no `~/.molesurface/bin/mo` → shows Install screen
2. In Settings → **Check for Updates** hits `https://api.github.com/repos/tw93/mole/releases/latest`
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

1. Fork and clone
2. `npm install`
3. `npm run tauri dev`
4. Make changes — keep the **zero Mole source changes** constraint
5. Open a PR — CI will validate TypeScript and Rust

---

## License

MIT — same as [tw93/mole](https://github.com/tw93/mole/blob/main/LICENSE).
