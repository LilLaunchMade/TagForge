# Implementation research

Research completed before coding. No proprietary application source or assets were accessed.

- Tauri 2 Windows prerequisites: https://v2.tauri.app/start/prerequisites/ — official supported Windows release toolchain is MSVC plus C++ Build Tools and WebView2.
- NSIS executable and offline WebView2 options: https://v2.tauri.app/distribute/windows-installer/ .
- Lofty supported formats and MIT/Apache licenses: https://docs.rs/crate/lofty/0.25.4/source/README.md .
- Lofty generic tags, primary tags, and write APIs: https://docs.rs/lofty/0.25.4/lofty/tag/struct.Tag.html and https://docs.rs/lofty/0.25.4/lofty/file/trait.TaggedFileExt.html .
- ID3v2 structure and frames: https://id3.org/Developer%20Information .
- Vorbis comments: https://xiph.org/vorbis/doc/v-comment.html .
- FLAC metadata: https://xiph.org/flac/format.html .
- MusicBrainz API and one-call-per-second/User-Agent policy: https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting .
- CAA release/front/thumbnail endpoints: https://musicbrainz.org/doc/Cover_Art_Archive/API .
- GPL text and compatibility guidance: https://www.gnu.org/licenses/gpl-3.0.html and https://www.gnu.org/licenses/license-list.html .

Container mapping: MP3 → ID3v2; FLAC/Ogg/Opus → Vorbis comments; M4A → MP4 ilst; WAV → its writable primary tag selected by Lofty. Unsupported fields are rejected if they do not survive a write/read roundtrip. Artwork is validated after writing. The application delegates container parsing to an independently licensed library rather than implementing proprietary editor algorithms.

AcoustID/Chromaprint is optional in the request and deferred. No API key or binary is bundled, and the interface does not pretend to offer identification.
