# Releasing Recall

Releases are driven by annotated `v<version>` tags. The GitHub Actions release workflow builds macOS, Linux, and Windows Tauri artifacts from each tag and attaches them to a draft GitHub Release.

## One command

From a clean `main` branch:

```sh
pnpm run release -- <version>
```

The version must be SemVer, for example `1.0.1` or `1.1.0-rc.1`.

The release script will:

1. Validate the version string.
2. Ensure the working tree is clean and `origin` is available.
3. Update `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
4. Refresh `src-tauri/Cargo.lock` through `cargo check`.
5. Run `pnpm run check`.
6. Commit the bump as `chore(release): v<version>`.
7. Create and push the annotated tag.

## Required CI Secrets

The Tauri updater artifact signer expects these repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## Manual Checklist

- `CHANGELOG.md` has release notes for the version.
- `pnpm run check` passes locally.
- `pnpm run tauri:build` has been tested on at least one platform.
- `src-tauri/tauri.conf.json` still has the correct product name, bundle id, updater endpoint, and icons.

Do not force-push over an already published tag. Cut a patch release instead.