# @recall/shared-types

Shared TypeScript types for the Recall workspace.

## Sources

- **`src/generated/`** — generated from Rust structs in
  [`apps/desktop/src-tauri/src/models.rs`](../../apps/desktop/src-tauri/src/models.rs)
  via the [`ts-rs`](https://crates.io/crates/ts-rs) crate. These files mirror
  the on-the-wire shape of values returned by Tauri commands.
- **`src/index.ts`** — re-exports the generated types and adds UI-only types
  (`View`, `DateFilter`, `UpdateStatus`, `OpenTab`, `Stats`, `AppInfo`) that
  have no Rust counterpart.

## Regenerating

From the repo root:

```sh
pnpm types:generate
```

This runs `cargo test export_bindings` inside `apps/desktop/src-tauri`, which
causes every struct annotated with `#[derive(TS)]` to emit its `.ts` file into
this package's `src/generated/` directory.

Never edit files in `src/generated/` by hand — changes will be overwritten.
