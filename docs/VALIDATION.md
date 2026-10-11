# Validation report — 1.0.0 release candidate

Verified on October 10, 2026 (America/Los_Angeles).

Development and tests were performed in background terminal processes. The TagForge desktop executable and installer were not launched. No desktop automation, mouse movement, keyboard simulation, application switching, or restart was used.

## Completed checks

| Check | Result | Scope |
| --- | --- | --- |
| TypeScript strict compilation and Vite production build | PASS | Real production frontend bundle |
| TypeScript model tests | PASS, 7 tests | Templates, Windows filenames, parsing, Unicode case, staging immutability, canonical numbering, duplicate detection |
| Headless Chromium UI workflow | PASS | Production React bundle, mocked native IPC, 3,000 generated library rows; virtualization, select/edit/stage/review/approve, rename → filename parsing, numbering, discard, search, themes and settings |
| Native Rust tests | PASS, 9 tests | Real filesystem operations; generated audio; damaged-file errors, backups, undo, external source/backup changes, reserved names, 1,000-file import, repeated import, request validation, rate spacing, optional session-backup cleanup |
| Six-format integration test | PASS | MP3, FLAC, M4A, WAV, Ogg Vorbis, Opus; Unicode text, lyrics/comments, dates, track/disc totals, album artist, PNG art, renamed filenames, field/art clearing, repeated undo |
| Audio preservation | PASS on generated fixtures | SHA-256 of decoded audio is unchanged after tag edits and clearing in all six formats; undo returns original file bytes |
| Full Tauri desktop compile check | PASS | Windows x64 GNU toolchain; app not launched |
| npm advisory audit | PASS | No known advisories reported for installed production or development graph at check time |
| Rust license audit | PASS | Locked Windows GNU/MSVC graphs, GPL-compatible allowlist; upstream notices collected |
| Rust advisory audit | PASS with documented maintenance exception | See DEPENDENCY_REVIEW.md; `paste` compile-time maintenance advisory is explicitly acknowledged |
| Dark/light visual inspection | PASS for headless layout sample | Synthetic library, no native window opened |

## Packaging status

The Windows x64 release executable compiled successfully and the NSIS installer was generated. The installer is delivered as `TagForge-v1.0.0-Setup.exe`, with a source ZIP and SHA-256 checksums alongside it. The installer is unsigned and has not been executed. Its setup script includes the offline Microsoft WebView2 runtime installer, WebView2Loader.dll, GPL license, and third-party notices.

Static PE inspection verifies one valid XML application manifest (Common Controls v6, long-path awareness, normal user execution), Windows x64 format, and system DLL imports plus the bundled WebView2Loader.dll. No Node.js, Rust, Python, FFmpeg, MinGW, or other development-tool DLL dependency appears in the application import table. This is static packaging evidence; it does not substitute for installation testing.

## Test environment and limits

- Windows x64; Node.js 24.19.0; Rust stable 1.99.0; portable MinGW MSVCRT compiler. The GitHub Actions configuration uses Microsoft's supported MSVC Windows build environment but has not been run remotely.
- Local GNU tooling initially supplied a duplicate default manifest. Its workspace-only default-manifest object was disabled, and TagForge supplies an explicit combined manifest. The corrected release was checked without launching it. MSVC builds use the same explicit app manifest and do not require this toolchain workaround.
- Lofty pinned to 0.25.4; exact dependency versions recorded in Cargo.lock and package-lock.json.
- Development-only FFmpeg from `@ffmpeg-installer/win32-x64@4.1.0`, binary N-92722-gf22fcd4483 (2018). It generates synthetic fixtures and computes decoded-audio hashes; it is not bundled. Testing current encoders and representative real-world tags remains necessary.
- Automated UI tests mock IPC and therefore do not prove native drag/drop, file dialogs, WebView2 integration, or native-window behavior. Rust tests independently exercise the real metadata implementation.
- The 1,000-file test uses tiny generated WAV files. It is not a benchmark of a large real-world music collection.
- No live MusicBrainz/CAA request was sent because a genuine maintainer/user contact was not supplied. Input validation and local rate limiting are tested; service integration remains a manual check.
- No crash injection, disk-full test, non-NTFS test, screen-reader audit, clean-machine installation, uninstall, or Windows 10/11 compatibility matrix was performed.

## Remaining release gates

Run the checklist in MANUAL_TESTS.md after the computer owner authorizes launching the app. Resolve data-safety failures before public distribution. Verify installer runtime dependencies, offline installation, interaction/accessibility, representative metadata preservation, live lookup, code-signing plans, and a real maintainer/security contact. Do not claim these checks are complete.

AcoustID/Chromaprint and automatic updates are deferred. Backup retention is optional and enabled by default; the native application exit cleanup still needs manual verification. Session-only undo and non-atomic whole-batch saves are deliberate documented limits.
