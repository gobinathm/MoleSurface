Build a local release .dmg for the current machine's architecture.

Steps:
1. Run `/check` first. If it fails, stop and report the errors.
2. Run `npm run tauri build` from the project root.
3. After a successful build, report the path to the generated .dmg file (found under `src-tauri/target/release/bundle/dmg/`).

Note: The first build takes several minutes as Rust dependencies are compiled. Subsequent builds are faster due to caching.
