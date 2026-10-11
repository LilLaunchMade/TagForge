# Contributing

Contributions must be original or have a documented GPL-3.0-or-later-compatible license. Do not submit proprietary editor code, reconstructed implementations, assets, or copied interface designs. By contributing, you license your contribution under GPL-3.0-or-later.

Read `docs/SAFETY.md` before changing writes or renames. Never add audio encoding, unconditional overwrite, file deletion actions, telemetry, or automatic metadata application. Keep Internet access optional and local editing independent of services.

Use feature branches and small pull requests explaining the user-visible problem, implementation, tests, and risks. Run TypeScript tests, frontend build, native tests with all six FFmpeg fixtures, and headless UI tests. Add regression coverage for data safety changes. Use `cargo fmt` and `cargo clippy` for Rust changes. Run `cargo deny check licenses` inside `src-tauri` and generate both notice inventories before distributing binaries.

Report a security or data-loss issue privately to the maintainer contact listed by the eventual GitHub repository. This project has not yet established a public reporting address; do not invent one. Include the affected version and a minimal synthetic fixture rather than private music or personal information.

Desktop interaction tests require explicit permission from the computer owner. Prefer background builds and headless tests.
