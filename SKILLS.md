# MoleSurface — Claude Code Skills Reference

This project ships with custom Claude Code slash commands and agents. Use them during development to automate common tasks.

---

## Slash Commands

Invoke with `/command-name` in a Claude Code session.

### `/check`
**Full compilation check — run this before committing.**

Runs `npm run build` (TypeScript + Vite) and `cargo check` (Rust) in sequence.
Reports errors with suggested fixes. Clean output confirms everything is ready.

```
/check
```

---

### `/build`
**Build a local .dmg for your machine.**

Runs `/check` first, then `npm run tauri build`. Reports the path to the generated `.dmg`.
Note: first build takes several minutes (Rust deps).

```
/build
```

---

### `/release`
**Cut a versioned release and trigger GitHub Actions.**

Validates the git state, confirms the version tag with you, then pushes the tag to trigger
the CI pipeline. GitHub Actions builds arm64 + amd64 `.dmg` files and publishes a GitHub Release.

```
/release
```

Release tag format: `v{major}.{minor}.{patch}` — e.g. `v1.0.0`

---

### `/add-page`
**Scaffold a new page that wraps a `mo` command.**

Asks for the subcommand, title, description, and icon, then creates the page file,
adds it to routing in `App.tsx`, and adds the nav item to `Sidebar.tsx`.

```
/add-page
```

---

## Agents

Invoke with `@agent-name` or through the Claude Code agent selector.

### `@release-validator`
**Pre-release checklist automation.**

Runs 7 checks before you tag a release:
- Clean git state
- Frontend compiles
- Rust compiles
- Version consistency (`package.json` vs `tauri.conf.json`)
- GitHub Actions workflows present and correct
- All icon files present
- Capabilities file valid (no deprecated Tauri v1 permission names)

Returns **READY TO RELEASE** or a list of blockers.

Use this before running `/release`.

---

### `@mole-compat-check`
**Check if a new Mole version breaks MoleSurface.**

When [tw93/mole](https://github.com/tw93/mole) publishes a new release, run this agent.
It reads the changelog, compares it against MoleSurface's integration points (JSON field names,
command invocations), and reports whether any updates are needed.

Returns **COMPATIBLE** or a list of files that need changes.

---

## Workflow Cheat Sheet

### Daily development
```
edit code → /check → fix errors → commit
```

### Before a release
```
@release-validator → fix any blockers → /release
```

### When Mole releases a new version
```
@mole-compat-check → update if needed → /check → /release
```

### Adding a new Mole command to the UI
```
/add-page → fill in details → /check
```

---

## CI/CD Quick Reference

| Trigger | Workflow | Output |
|---------|---------|--------|
| Push to `main` / PR | `ci.yml` | Type check + Rust check |
| `git tag v*.*.*` | `release.yml` | `MoleSurface_*_aarch64.dmg` + `MoleSurface_*_x64.dmg` published to GitHub Release |

Secrets needed for Apple notarization (optional):
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
