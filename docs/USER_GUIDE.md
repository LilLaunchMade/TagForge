# User guide

## Selection and batch work

Library header buttons sort; pressing the same column reverses direction. Search includes fields and paths. Filters show staged files, missing title/artist/album, or potential duplicates. Duplicate detection never deletes files.

Use checkboxes to build a selection or click a cell to select one track. The editor previews the first selected track's art. Batch fields begin unchanged; typing checks the corresponding field. Check an empty field to clear it. Artwork changes must be staged with the field form. Removing art removes front covers and preserves other picture types where Lofty supports them. M4A's `covr` artwork has no front/back type; an artwork operation replaces or removes all its embedded covers.

## Templates

Rename: `{track:02} - {artist} - {title}` yields `03 - Artist - Title.mp3`. Include only the base name; TagForge adds the original extension. Invalid characters in metadata values become underscores. Missing values and unsafe Windows names are errors. No folder moves, overwrites, or extension changes are allowed.

Filename to metadata: `{track} - {artist} - {title}` parses `03 - Artist - Title.mp3`. Separators are literal. Templates are ambiguous if separator text also appears in field values; inspect the staged result. Repeated or unknown fields are rejected.

Replace is literal and case sensitive. Title Case uses Unicode letters and whitespace/hyphen boundaries, rather than language-specific editorial rules. Auto-numbering follows the currently visible sort order and sets total tracks to the highest generated number; select one album at a time if each needs separate numbering.

## Online lookup

Supply a real contact email or project URL for MusicBrainz's User-Agent requirement. The app does not require an account. Search supports MusicBrainz's recording search syntax. Results show candidate releases. Recording application uses the first returned release's album/date; verify it. Cover buttons use the explicitly selected release. MusicBrainz data and cover images are always staged for review, never written on lookup.

The search query and contact go directly to MusicBrainz. Cover requests go to Cover Art Archive and may redirect to archive.org. Local tags are not otherwise uploaded. Offline use remains fully available. Errors such as 404, 503, timeout, missing covers, and invalid contact are reported without writing files.

## Undo and recovery

Undo staged restores up to 20 staging-operation snapshots. Standard Ctrl+Z still works inside text inputs. Restore last save restores one committed file at a time, in reverse order, during this session. It requires no staged edits and refuses a file or backup changed externally.

Permanent backups are enabled by default. Settings can disable retaining backups after closing; temporary `.tagforge-undo-*.bak` rollback files then support session undo and are removed on normal exit when possible. Crashes or locked files may leave recovery copies. The library and undo history are held in memory, while theme, column choices, backup preference, and online contact persist in local WebView storage. Closing loses the imported library and session undo; retained backups remain on disk.
