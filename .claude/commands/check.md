Run full type and compilation check across both the frontend and Rust backend.

Execute the following steps in sequence:

1. Run `npm run build` from the project root. Report any TypeScript or Vite errors.
2. Run `cargo check --manifest-path src-tauri/Cargo.toml` from the project root. Report any Rust compilation errors.

If both pass, confirm with: "✓ TypeScript and Rust both compile cleanly."
If either fails, show the error output and suggest a fix.
