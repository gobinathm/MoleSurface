# Contributing to MoleSurface

Thank you for taking the time to contribute! This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [The Golden Rule](#the-golden-rule)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Pull Request Standards](#pull-request-standards)
- [Commit Convention](#commit-convention)
- [What We Accept](#what-we-accept)

---

## Code of Conduct

Be kind, constructive, and respectful. We are all here to build something useful.

---

## The Golden Rule

> **Zero changes to [tw73/mole](https://github.com/tw73/mole).**

MoleSurface invokes `mo` as a subprocess only. Never suggest editing, patching, or forking Mole. If Mole's CLI changes, adapt MoleSurface's invocation code — not Mole.

---

## Development Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Xcode Command Line Tools | latest | `xcode-select --install` |

### Running locally

```bash
git clone https://github.com/YOUR_FORK/MoleSurface.git
cd MoleSurface
npm install
npm run tauri dev
```

The app hot-reloads on frontend changes. Rust changes trigger a recompile.

### Verifying your changes build

```bash
npm run build          # TypeScript + Vite
cargo check --manifest-path src-tauri/Cargo.toml
```

Both must pass before opening a PR.

---

## Project Structure

```
MoleSurface/
├── src/                        # React + TypeScript frontend
│   ├── components/             # Shared components (Terminal, StreamPage, Sidebar…)
│   ├── pages/                  # One file per sidebar page
│   └── lib/                    # theme.ts, mole.ts, github.ts
├── src-tauri/
│   ├── src/lib.rs              # All Rust/Tauri commands
│   └── capabilities/default.json  # Permission scopes
└── .github/workflows/          # CI + release pipelines
```

**Key rules:**
- New pages go in `src/pages/` and must be registered in `src/App.tsx`
- New Tauri commands go in `src-tauri/src/lib.rs` and registered in `generate_handler![]`
- New permissions go in `src-tauri/capabilities/default.json`
- Never hardcode colors — use `colors[theme].xxx` from `src/lib/theme.ts`
- Never hardcode paths — use `getHomeDir()` / `findMoLocation()` from `src/lib/mole.ts`
- Icons: lucide-react only

---

## Making Changes

### Branches

Create a feature branch from `main`:

```bash
git checkout -b feat/my-feature
# or
git checkout -b fix/the-bug
```

### Prefixes

| Prefix | Use for |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Maintenance, deps, tooling |
| `docs/` | Documentation only |
| `refactor/` | Code changes with no behaviour change |

---

## Pull Request Standards

### Before opening a PR

- [ ] `npm run build` passes (TypeScript + Vite)
- [ ] `cargo check` passes
- [ ] No new `any` types in TypeScript without a comment explaining why
- [ ] No hardcoded colors or paths
- [ ] New Tauri commands are registered in `generate_handler![]`
- [ ] UI changes work in both light and dark mode

### PR title format

```
<type>(<scope>): <short description>

Examples:
feat(dashboard): add per-core CPU sparklines
fix(analyze): handle empty directories gracefully
chore(deps): bump tauri to 2.x.x
```

### PR description

Use the template provided when you open a PR. At minimum include:
- **What** changed
- **Why** it was needed
- **How** to test it

### Size

- Keep PRs focused. One feature or fix per PR.
- If a PR touches more than ~400 lines, consider splitting it.
- Dependency updates (from Dependabot) can be merged as-is if CI passes.

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

[optional body]
```

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Deps, tooling, CI |
| `docs` | Docs only |
| `refactor` | No behaviour change |
| `perf` | Performance improvement |

---

## What We Accept

### Good candidates

- Bug fixes with a clear reproduction case
- UI improvements that match the macOS-native feel
- New pages backed by a real `mo` subcommand
- Performance improvements to the Rust backend
- Accessibility improvements
- Documentation fixes

### What we won't accept

- Changes that require modifying `tw73/mole`
- Pages or features not backed by a real `mo` command
- New icon libraries (lucide-react only)
- Hardcoded colors or magic path strings
- TypeScript `any` without justification
- Features that duplicate what `mo` already provides in its own UI

---

## Questions?

Open a [Discussion](../../discussions) — not an issue — for questions and ideas.
