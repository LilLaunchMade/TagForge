# TagForge

**Your music. Your details.** An independently developed, local Windows music metadata editor built with Tauri 2, React, TypeScript, and Rust.

TagForge edits metadata without re-encoding audio. It has no TagForge server, accounts, subscriptions, telemetry, or cloud database. MusicBrainz and Cover Art Archive are optional direct connections.

## Release status

Version 1.0.0 is packaged as an unsigned Windows release candidate. The source, executable/installer build, and automated checks are complete; interactive installation and desktop verification remain pending. See [the validation report](docs/VALIDATION.md) for evidence and remaining release gates. No GitHub repository or release has been published by this development session.

## Features

- MP3, FLAC, M4A, WAV, Ogg Vorbis, and Opus through Lofty, where the container supports the requested field.
- Title, artist, album, album artist, genre, date, track/disc numbers and totals, lyrics, comments, and front artwork.
- File and recursive folder import, native drag and drop, search, sort, and missing-detail filters.
- Virtualized library rows, configurable columns, adjustable editing panel, dark/light themes, and keyboard shortcuts.
- Batch edits, literal find/replace, capitalization, auto-numbering, filename parsing, and metadata-based renaming.
- Staged changes and per-file review, recovery backups, external-change detection, and saved-file undo during the current session.
- MusicBrainz recording search and Cover Art Archive front covers, selected and approved by the user.
- Exact-file duplicate detection plus likely matches by title, artist, and rounded duration. This is **not acoustic identification**.

AcoustID/Chromaprint identification, automatic updates, cancellation of an import in progress, persistent undo across sessions, and a persistent library database are not implemented. There are no placeholder controls for these features.

## Installation

When a verified release is available, download `TagForge-v1.0.0-Setup.exe` from this project's GitHub Releases, compare its SHA-256 checksum, and run the installer. It installs for the current Windows user. The configured NSIS bundle includes the offline WebView2 runtime installer, so local editing does not require an Internet connection after installation.

No Node.js, Rust, Python, FFmpeg, or development tools are required on the destination computer. The unsigned build may trigger Windows reputation prompts; code signing and clean-machine install/uninstall checks are release checklist items. Supported target: Windows 10/11 x64.

## First edit

1. Add music or a folder, or drop files into TagForge.
2. Select tracks using checkboxes. Shift-click selects a range; the header checkbox selects the filtered library.
3. Check the fields to change. An empty checked value clears a field. Unchecked fields stay untouched.
4. Choose **Stage selected fields**, then **Review & save**.
5. Inspect old/new values and filenames, then approve writing.

Batch transform dialogs operate on selected tracks visible under the current search/filter, in current sort order. Field edits and online result application operate on the tracks indicated by the workbench selection count. Each file is committed independently: an error on one file does not roll back successful files in the batch. Errors remain visible, and failed edits remain staged.

Backups are retained by default, named `<original-name>.tagforge-backup-<timestamp>`. Settings can turn off retention after closing: temporary `.tagforge-undo-… .bak` copies still support session undo and are cleaned up on normal exit when possible. A crash or locked backup can leave recovery copies. Keep permanent backups until satisfied with your edits. To recover after restarting, close TagForge, move the changed file aside, and copy its backup back to its original name and extension. Do not rename a backup over another file without checking it first. Normal imports ignore backup extensions.

See [the user guide](docs/USER_GUIDE.md), [file safety](docs/SAFETY.md), and [manual release checks](docs/MANUAL_TESTS.md).

## Build from source

Install Node.js 24, Rust stable **MSVC**, Microsoft C++ Build Tools with the desktop C++ workload, and WebView2. See [Tauri's official Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
npx playwright install chromium --only-shell
npm run test:ui
npm run tauri -- build
```

The last command compiles and packages without launching TagForge. **Do not run `npm run tauri dev` on another person's desktop without their authorization.**

For six-format audio tests, install a development-only FFmpeg build with libmp3lame, libvorbis, and libopus and set `$env:FFMPEG_PATH` to its executable before `cargo test`. The tests create their own short sine-wave fixtures in temporary directories. FFmpeg is never bundled with TagForge. Set `CARGO_BUILD_JOBS=2` to reduce compiler resource use.

`scripts/package.ps1` builds and copies the NSIS artifact to `release/TagForge-v1.0.0-Setup.exe`. GitHub Actions builds the same named artifact and uploads it for review; it has no publication step or write permission. Both dependency lockfiles are included.

## Licensing and independence

TagForge original source and branding are licensed under **GPL-3.0-or-later**; see [LICENSE](LICENSE). TagForge was developed independently without accessing, copying, decompiling, or reconstructing Mp3tag code, algorithms, UI, or assets. No Mp3tag materials are included.

Direct dependencies use MIT or Apache-2.0-compatible choices. See [third-party notices](THIRD_PARTY_NOTICES.md) and the generated inventories in `docs/licenses`. License verification must cover the exact locked dependency graph before publication. MusicBrainz data and cover artwork have separate terms; the application license does not grant ownership of third-party images.
