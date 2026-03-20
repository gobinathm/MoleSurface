# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | ❌ |

Only the latest published release receives security fixes. Please update before reporting.

## Scope

MoleSurface is a **desktop UI wrapper** for [tw93/mole](https://github.com/tw93/mole). Our security surface covers:

- The Tauri application shell and Rust backend (`src-tauri/`)
- The React/TypeScript frontend (`src/`)
- GitHub Actions workflows (`.github/workflows/`)
- The install/update mechanism that downloads Mole binaries from GitHub Releases

**Out of scope:** Vulnerabilities in `mole` itself — report those at [tw93/mole](https://github.com/tw93/mole/security).

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

1. Go to **[Security → Report a vulnerability](../../security/advisories/new)** on this repository
2. Fill in the advisory form with:
   - A clear description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (optional)

You will receive an acknowledgement within **48 hours** and a status update within **7 days**.

## What to Expect

| Timeline | Action |
|----------|--------|
| 48 hours | Acknowledgement of your report |
| 7 days | Initial assessment and severity triage |
| 30 days | Fix released (critical/high) or timeline communicated |

If a fix is released, you will be credited in the release notes unless you prefer to remain anonymous.

## Security Considerations

### Binary Downloads

MoleSurface downloads the `mo` binary directly from GitHub Releases (`https://github.com/tw73/mole/releases`). The download:
- Uses HTTPS only (enforced by Tauri's HTTP plugin)
- Targets the official `tw73/mole` repository
- Is stored at `~/.molesurface/bin/mo`

### Tauri Capabilities

The app's capabilities are intentionally minimal (`src-tauri/capabilities/default.json`):
- **Filesystem**: scoped to `~/.molesurface/` only
- **HTTP**: used exclusively for GitHub API calls and binary downloads
- **Shell**: no shell plugin; all process spawning is done via explicit Rust commands

### Admin Privileges

The admin mode (Clean/Optimize pages) uses a temporary `SUDO_ASKPASS` script in `/tmp` to invoke a native macOS password dialog. The script is deleted immediately after use. No passwords are stored or transmitted.
