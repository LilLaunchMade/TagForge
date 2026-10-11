# Third-party licenses and data

TagForge is GPL-3.0-or-later. This does not relicense dependencies; their copyright and license notices remain applicable. The complete GPL text is in LICENSE.

| Direct component | Purpose | Declared upstream license / chosen basis |
| --- | --- | --- |
| Tauri, tauri-build, Tauri JavaScript API/CLI | Desktop runtime and packaging | MIT OR Apache-2.0; choose MIT |
| React, React DOM | UI | MIT |
| TypeScript | Build-time type checking | Apache-2.0 |
| Vite | Build tooling | MIT |
| Lofty | Audio metadata | MIT OR Apache-2.0; choose MIT |
| serde, serde_json | Serialization | MIT OR Apache-2.0; choose MIT |
| sha2 | Conflict checks | MIT OR Apache-2.0; choose MIT |
| tempfile | Staging | MIT OR Apache-2.0; choose MIT |
| base64 | Artwork transfer | MIT OR Apache-2.0; choose MIT |
| walkdir | Folder enumeration | MIT OR Unlicense; choose MIT |
| reqwest | Direct optional lookup | MIT OR Apache-2.0; choose MIT |
| rfd | User-invoked native file picker | MIT |
| Playwright | Headless tests, development only | Apache-2.0 |
| Prettier | Source formatting, development only | MIT |

These direct license choices are compatible with GPLv3 redistribution. Exact transitive versions and expressions are recorded in `docs/licenses/*-inventory.json`, with collected upstream notices alongside them. The Rust license allowlist is `src-tauri/deny.toml`; dependency declarations alone are not a substitute for reviewing notices and running the release checks. MPL-2.0 dependencies retain their file-level terms. Chromium and FFmpeg test tools are external development tools and must not be bundled in source release archives or app installers.

React: https://github.com/facebook/react/blob/main/LICENSE

Tauri: https://github.com/tauri-apps/tauri

Lofty: https://github.com/Serial-ATA/lofty-rs

Microsoft WebView2 is a separately licensed Microsoft runtime installed by the configured offline bootstrapper. Review its redistribution terms before publishing the installer. NSIS and its bundled installer components retain their upstream notices; GPL rights to TagForge do not apply to those components.

MusicBrainz core data is generally CC0; supplementary data is CC BY-SA under the database's terms: https://musicbrainz.org/doc/About/Data_License . Requests identify TagForge and the user-provided contact and are serialized to at most one per 1.1 seconds. The contact is stored locally and sent in the User-Agent only when lookup is invoked. Cover artwork can be copyrighted; verify rights for your intended use. CAA API: https://musicbrainz.org/doc/Cover_Art_Archive/API .
