Cut a new MoleSurface release by tagging and pushing to GitHub.

Before proceeding, confirm the version number with the user (e.g. "v1.0.0"). Do not guess.

Steps:
1. Run `/check` to ensure everything compiles. Stop if it fails.
2. Check `git status` — the working tree must be clean. If not, stop and tell the user.
3. Check `git log --oneline -5` to show recent commits.
4. Show the user the proposed tag and ask for final confirmation before tagging.
5. Once confirmed:
   a. `git tag <version>`
   b. `git push origin <version>`
6. Tell the user: "GitHub Actions is now building the arm64 and amd64 .dmg files. Watch progress at: https://github.com/<owner>/MoleSurface/actions"

Note: The release workflow (`.github/workflows/release.yml`) runs automatically on the tag push. It publishes the .dmg files to a new GitHub Release.
