# MoleSurface — Claude Instructions

## The one rule that overrides everything

**Zero changes to tw93/mole.** MoleSurface invokes `mo` as a subprocess only. Never suggest editing, patching, or forking Mole. If Mole's CLI changes, adapt MoleSurface's invocation code — not Mole.

---

## Stack

| Layer | Tech |
|-------|------|
| UI framework | React 18 + TypeScript (strict) |
| Desktop shell | Tauri v2 |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` — utility classes preferred |
| Icons | lucide-react only |
| Build | Vite 6 |
| Backend | Rust (Tauri commands in `src-tauri/src/lib.rs`) |

---

## Key architecture decisions

### Mole binary path
- Installed at: `~/.molesurface/bin/mo`
- Version file: `~/.molesurface/version`
- All helpers in `src/lib/mole.ts` — use those, don't inline paths
- Always pass `PATH: ${binPath}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin` when spawning `mo`

### Theme system
- `src/lib/theme.ts` exports `colors.light` and `colors.dark` — every component receives `theme: Theme` as a prop
- Never hardcode colors — always use `colors[theme].xxx`
- System theme is detected in `App.tsx` via `window.matchMedia`, passed down as props

### Streaming output
- Use `StreamPage` component for any page that runs a `mo` command and streams output
- `Terminal` component handles auto-scroll and display — don't reimplement it
- Spawn commands via `Command.create(moPath, [command, ...args], { env })` from `@tauri-apps/plugin-shell`

### Tauri commands (Rust)
- `check_arch()` → `"arm64"` | `"x86_64"`
- `get_home_dir()` → `string` (the user's `$HOME`)
- New commands go in `src-tauri/src/lib.rs` and must be registered in `.invoke_handler()`

### Capabilities
- `src-tauri/capabilities/default.json` controls what the frontend can do
- Valid fs permissions: `fs:allow-mkdir`, `fs:allow-exists`, `fs:allow-read-file`, `fs:allow-read-text-file`, `fs:allow-write-file`, `fs:allow-write-text-file`, `fs:allow-remove`
- Scope: `fs:scope-home-recursive` for `~/.molesurface/`

---

## What NOT to do

- Don't use `@tauri-apps/api/window` (deprecated in v2) — use `@tauri-apps/api/core` for `invoke`
- Don't hardcode `~` in paths — always get home via `invoke('get_home_dir')`
- Don't use `fs:allow-create-dir` — it doesn't exist in Tauri v2; use `fs:allow-mkdir`
- Don't add Homebrew dependency — Mole is installed directly from GitHub release tarballs
- Don't add pages or features not backed by a real `mo` command
- Don't use `any` in TypeScript without a comment explaining why

---

## Common patterns

### Run a mo command with streaming
```tsx
import StreamPage from "../components/StreamPage";
export default function MyPage({ theme }: { theme: Theme }) {
  return <StreamPage title="X" description="..." command="x" icon={<Icon size={17} />} theme={theme} />;
}
```

### Run a mo command and parse JSON output
```ts
const cmd = Command.create(moPath, ["status", "--json"], { env: { PATH: ..., HOME: homeDir } });
let output = "";
cmd.stdout.on("data", (d: string) => (output += d));
await new Promise<void>((resolve) => { cmd.on("close", resolve); cmd.spawn(); });
const data = JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
```

### Check and handle Mole not installed
```ts
// This is handled automatically by App.tsx — it shows Install.tsx when mo is missing.
// Pages don't need to check independently.
```

---

## CI/CD

- **CI:** Every push/PR → `.github/workflows/ci.yml` → `npm run build` + `cargo check`
- **Release:** Push a `v*.*.*` tag → `.github/workflows/release.yml` → two .dmg files published to GitHub Release

To release:
```bash
git tag v1.0.0 && git push origin v1.0.0
```

---

## File ownership map

| Area | Files |
|------|-------|
| Mole lifecycle | `src/lib/mole.ts`, `src/pages/Install.tsx`, `src/pages/Settings.tsx` |
| GitHub API | `src/lib/github.ts` |
| Theme | `src/lib/theme.ts` — touch colors here only |
| Routing | `src/App.tsx` — add new pages here |
| New streaming page | add to `src/pages/`, extend `Page` type in `App.tsx` |
| New Tauri command | `src-tauri/src/lib.rs` → register in `generate_handler![]` |
| Permissions | `src-tauri/capabilities/default.json` |
