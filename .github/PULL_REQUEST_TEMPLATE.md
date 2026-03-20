## What does this PR do?

<!-- A clear, concise summary of the change. One sentence is fine for small fixes. -->

## Why is this needed?

<!-- The motivation: bug being fixed, feature being added, or improvement being made. -->

## How to test

<!-- Step-by-step instructions to verify the change works as expected. -->

1.
2.
3.

## Checklist

- [ ] `npm run build` passes (TypeScript + Vite)
- [ ] `cargo check` passes
- [ ] Works in both **light mode** and **dark mode** (if UI change)
- [ ] No hardcoded colors — uses `colors[theme].xxx`
- [ ] No hardcoded paths — uses `getHomeDir()` / `findMoLocation()`
- [ ] New Tauri commands are registered in `generate_handler![]` (if applicable)
- [ ] No `any` types in TypeScript without an explanatory comment
- [ ] Zero changes to [tw73/mole](https://github.com/tw73/mole) source

## Screenshots / recordings (if UI change)

<!-- Drag and drop images/videos here. Before & after preferred. -->

## Related issues

<!-- Closes #123 -->
