# Releasing

Releases are driven by pushing an annotated `v<version>` tag. A GitHub Actions workflow (`.github/workflows/release.yml`) builds macOS arm64 and Linux x86_64 installers and attaches them to the matching GitHub Release.

## One command

From a clean `main`:

```sh
npm run release -- <version>
```

where `<version>` follows SemVer, e.g. `0.5.0` or `0.5.0-rc.1`.

The script ([`scripts/release.sh`](../scripts/release.sh)) will:

1. Validate the version string.
2. Ensure the working tree is clean and you're on `main`.
3. Update the version in:
   - the root `package.json`,
   - `apps/desktop/package.json`,
   - `packages/shared-types/package.json`,
   - `apps/desktop/src-tauri/Cargo.toml` (and regenerate `Cargo.lock`),
   - `apps/desktop/src-tauri/tauri.conf.json`.
4. Run `npm run check` (typecheck every workspace + `cargo check`).
5. Commit the bump with message `chore(release): v<version>`.
6. Create tag `v<version>`.
7. Push the commit and the tag.

The GitHub Actions release workflow triggers on the tag push.

## Manual checklist before tagging

- [ ] `main` is green on CI.
- [ ] `CHANGELOG.md` has an `[Unreleased]` section ready to cut — move the entries under a new `[<version>] — YYYY-MM-DD` heading.
- [ ] `packages/shared-types/src/generated/` is up to date (`npm run types:generate` reports no diff).
- [ ] `apps/desktop/src-tauri/tauri.conf.json > productName` and the app icon are still correct.
- [ ] Tested `npm run tauri:build` locally on at least one platform.

## Post-release

- Edit the draft Release on GitHub if you want richer release notes. The workflow creates the release as published, non-draft, non-prerelease by default — change that behaviour in `.github/workflows/release.yml` if you'd prefer drafts.
- Bump `[Unreleased]` back into `CHANGELOG.md` for the next cycle.

## Emergency rollback

If a release is broken:

1. Mark the GitHub Release as **pre-release** or **draft** to hide it from the update check.
2. Tag a new patch (`0.5.1`) that fixes the issue.

Do **not** force-push over an already-tagged release — users who upgraded will be stuck with the broken artifact.

## Platform coverage today

| Platform        | Built by CI | Binary                        |
|-----------------|-------------|-------------------------------|
| macOS (arm64)   | ✅          | `.dmg`, `.app`                |
| macOS (x86_64)  | ❌ (build locally if needed) | `.dmg`, `.app` |
| Linux (x86_64)  | ✅          | `.AppImage`, `.deb`           |
| Windows         | ❌ (build locally if needed) | `.msi`           |

Adding a platform = adding a matrix entry in `.github/workflows/release.yml`.
