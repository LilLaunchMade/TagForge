//! Headless integration tests. Set FFMPEG_PATH to a development-only ffmpeg binary.
use crate::core::{Change, Library};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{collections::BTreeMap, fs, path::Path, process::Command};
fn decoded_hash(ffmpeg: &str, path: &Path) -> Vec<u8> {
    let o = Command::new(ffmpeg)
        .args(["-v", "error", "-i"])
        .arg(path)
        .args(["-map", "0:a:0", "-f", "hash", "-hash", "sha256", "-"])
        .output()
        .unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    o.stdout
}
#[test]
fn all_six_formats_preserve_decoded_audio_and_unedited_fields() {
    let Ok(ffmpeg) = std::env::var("FFMPEG_PATH") else {
        assert!(std::env::var("CI").is_err(), "CI must provide FFMPEG_PATH");
        eprintln!("SKIPPED six-format test: FFMPEG_PATH is unset");
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    for (extension, codec) in [
        ("mp3", "libmp3lame"),
        ("flac", "flac"),
        ("m4a", "aac"),
        ("wav", "pcm_s16le"),
        ("ogg", "libvorbis"),
        ("opus", "libopus"),
    ] {
        let path = dir.path().join(format!("test.{extension}"));
        let output = Command::new(&ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=0.2",
                "-c:a",
                codec,
                "-metadata",
                "genre=Preserve me",
                "-metadata",
                "album=Original album",
            ])
            .arg(&path)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{extension}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let original = fs::read(&path).unwrap();
        let before = decoded_hash(&ffmpeg, &path);
        let mut lib = Library::default();
        let r = lib.import(vec![path.to_string_lossy().into()], |_, _| {});
        assert!(r.errors.is_empty(), "{extension}: {:?}", r.errors);
        let t = &r.tracks[0];
        let genre = t.fields["genre"].clone();
        let album = t.fields["album"].clone();
        let art = format!(
            "data:image/png;base64,{}",
            STANDARD.encode(include_bytes!("../icons/icon.png"))
        );
        let change = Change {
            path: t.path.clone(),
            fingerprint: t.fingerprint.clone(),
            fields: BTreeMap::from([
                ("title".into(), "Test title — 日本語".into()),
                ("artist".into(), "Independent artist".into()),
                ("albumArtist".into(), "Album artist".into()),
                ("track".into(), "2".into()),
                ("trackTotal".into(), "12".into()),
                ("disc".into(), "1".into()),
                ("discTotal".into(), "2".into()),
                ("year".into(), "2026".into()),
                ("lyrics".into(), "Lyrics line 1\nLine 2".into()),
                ("comment".into(), "Comment".into()),
            ]),
            artwork: Some(art),
            new_name: Some(format!("renamed.{extension}")),
            retain_backups: true,
        };
        let saved = lib
            .save(change)
            .unwrap_or_else(|e| panic!("{extension}: {e}"));
        assert_eq!(saved.fields["genre"], genre, "{extension}: genre");
        assert_eq!(saved.fields["album"], album, "{extension}: album");
        assert_eq!(
            decoded_hash(&ffmpeg, Path::new(&saved.path)),
            before,
            "{extension}: audio changed"
        );
        assert!(saved.has_art, "{extension}: artwork missing");
        let cleared = lib
            .save(Change {
                path: saved.path.clone(),
                fingerprint: saved.fingerprint.clone(),
                fields: BTreeMap::from([
                    ("title".into(), "".into()),
                    ("lyrics".into(), "".into()),
                    ("album".into(), "".into()),
                ]),
                artwork: Some(String::new()),
                new_name: None,
                retain_backups: true,
            })
            .unwrap_or_else(|e| panic!("{extension} clear: {e}"));
        assert_eq!(cleared.fields["title"], "");
        assert_eq!(cleared.fields["album"], "");
        assert!(!cleared.has_art);
        assert_eq!(decoded_hash(&ffmpeg, Path::new(&cleared.path)), before);
        lib.undo_last().unwrap();
        lib.undo_last().unwrap();
        assert_eq!(
            fs::read(&path).unwrap(),
            original,
            "{extension}: undo bytes"
        );
    }
}
