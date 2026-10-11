# Manual release checklist — not run without desktop authorization

These checks require an interactive Windows session and were deliberately excluded from background development. Record the Windows version, filesystem, build SHA-256, result, and tester for each item.

- Install the exact setup artifact on clean Windows 10/11 x64, with and without WebView2, offline. Verify no development tools are needed. Uninstall and reinstall; confirm music and backups survive.
- Launch explicitly. Test native file/folder pickers and shell drag/drop for files and folders, Unicode paths, long paths, locked/read-only files, empty folders, inaccessible subdirectories, and symlinks.
- Verify keyboard focus, shortcuts, close confirmation with drafts, 100–200% display scaling, dark/light contrast, panel resizing, scrolling, and all visible controls.
- Import a representative 10,000-track library and measure responsiveness, RAM, import/save times, and disk space needed for backups.
- Edit every field and JPEG/PNG front art in each format, with multiple art types, multiple tag blocks, multi-value tags, proprietary fields, malformed tags, large lyrics, and existing chapter/cue structures. Verify in independent players.
- Validate decoded audio and unrelated metadata before/after; compare album artwork, unknown items, dates, track/disc totals, and file permissions. Verify failed saves leave originals usable.
- Test rename conflicts, case-only names, reserved names, disk-full conditions, permission failures, file locks, source/backup changes, and recovery after a forced process termination during copy/replace/rename.
- Test undo repeatedly across several saves to the same file, across renamed files, and after an external edit. Verify recovery copies manually after reopening.
- Test MusicBrainz and CAA with a genuine contact string, no network, timeout, no results, multiple releases, missing art, and rate limiting. Confirm candidate data is not written without review.
- Review exact dependency license inventory, Microsoft WebView2 redistribution terms, installer component notices, accessibility, code signing, and public-facing maintainer/security contact before publication.

Do not publish until data-safety failures are resolved and required checks pass. This project does not include silent release or GitHub publication automation.
