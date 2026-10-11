use base64::{engine::general_purpose::STANDARD, Engine};
use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    picture::{Picture, PictureType},
    tag::{ItemKey, Tag, TagExt},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub type Result<T> = std::result::Result<T, String>;
pub const FIELDS: [&str; 12] = [
    "title",
    "artist",
    "album",
    "albumArtist",
    "genre",
    "year",
    "track",
    "disc",
    "lyrics",
    "comment",
    "trackTotal",
    "discTotal",
];
fn key(k: &str) -> Result<ItemKey> {
    Ok(match k {
        "title" => ItemKey::TrackTitle,
        "artist" => ItemKey::TrackArtist,
        "album" => ItemKey::AlbumTitle,
        "albumArtist" => ItemKey::AlbumArtist,
        "genre" => ItemKey::Genre,
        "year" => ItemKey::RecordingDate,
        "track" => ItemKey::TrackNumber,
        "disc" => ItemKey::DiscNumber,
        "lyrics" => ItemKey::Lyrics,
        "comment" => ItemKey::Comment,
        "trackTotal" => ItemKey::TrackTotal,
        "discTotal" => ItemKey::DiscTotal,
        _ => return Err(format!("Unknown field: {k}")),
    })
}
fn key_for(k: &str, kind: lofty::tag::TagType) -> Result<ItemKey> {
    if k == "lyrics" && kind == lofty::tag::TagType::Id3v2 {
        Ok(ItemKey::UnsyncLyrics)
    } else {
        key(k)
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub path: String,
    pub name: String,
    pub format: String,
    pub duration: f64,
    pub bytes: u64,
    pub fields: BTreeMap<String, String>,
    pub has_art: bool,
    pub fingerprint: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub fingerprint: String,
    pub fields: BTreeMap<String, String>,
    pub artwork: Option<String>,
    pub new_name: Option<String>,
    #[serde(default = "default_true")]
    pub retain_backups: bool,
}
fn default_true() -> bool {
    true
}
#[derive(Clone, Serialize, Debug)]
pub struct Failure {
    pub path: String,
    pub error: String,
}
#[derive(Default, Serialize)]
pub struct ImportReport {
    pub tracks: Vec<Track>,
    pub errors: Vec<Failure>,
}
#[derive(Clone)]
pub struct Undo {
    pub current: PathBuf,
    pub original: PathBuf,
    pub backup: PathBuf,
    pub saved_hash: String,
    pub original_hash: String,
}
#[derive(Default)]
pub struct Library {
    pub tracks: HashMap<String, Track>,
    pub undo: Vec<Undo>,
    temporary_backups: Vec<tempfile::TempPath>,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn hash(path: &Path) -> Result<String> {
    let mut f = File::open(path).map_err(err)?;
    let mut h = Sha256::new();
    let mut buf = [0; 65536];
    loop {
        let n = f.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
pub fn read_track(path: &Path) -> Result<Track> {
    let file = lofty::read_from_path(path).map_err(err)?;
    let tag = file.primary_tag().or_else(|| file.first_tag());
    let fields = FIELDS
        .iter()
        .map(|k| {
            let value = tag.into_iter().chain(file.tags().iter()).find_map(|t| {
                t.get_string(key_for(k, t.tag_type()).unwrap()).or_else(|| {
                    if *k == "lyrics" {
                        t.get_string(ItemKey::UnsyncLyrics)
                    } else {
                        None
                    }
                })
            });
            (k.to_string(), value.unwrap_or("").to_string())
        })
        .collect();
    Ok(Track {
        path: path.to_string_lossy().into(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        format: path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_uppercase(),
        duration: file.properties().duration().as_secs_f64(),
        bytes: fs::metadata(path).map_err(err)?.len(),
        fields,
        has_art: tag.is_some_and(|t| !t.pictures().is_empty()),
        fingerprint: hash(path)?,
    })
}
pub fn supported(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "mp3" | "flac" | "m4a" | "wav" | "ogg" | "opus"
    )
}
impl Library {
    pub fn clean_temporary_backups(&mut self) {
        self.temporary_backups.clear();
    }
    pub fn import(
        &mut self,
        paths: Vec<String>,
        mut progress: impl FnMut(usize, usize),
    ) -> ImportReport {
        let mut report = ImportReport::default();
        let mut files = Vec::new();
        for p in paths {
            let path = PathBuf::from(&p);
            if path.is_dir() {
                for entry in walkdir::WalkDir::new(&path).follow_links(false) {
                    match entry {
                        Ok(e) if e.file_type().is_file() && supported(e.path()) => {
                            files.push(e.into_path())
                        }
                        Err(e) => report.errors.push(Failure {
                            path: p.clone(),
                            error: e.to_string(),
                        }),
                        _ => {}
                    }
                }
            } else if supported(&path) {
                files.push(path);
            } else {
                report.errors.push(Failure {
                    path: p,
                    error: "Unsupported file extension".into(),
                });
            }
        }
        let total = files.len();
        for (i, path) in files.into_iter().enumerate() {
            match fs::canonicalize(&path)
                .map_err(err)
                .and_then(|p| read_track(&p))
            {
                Ok(t) => {
                    if !self.tracks.contains_key(&t.path) {
                        self.tracks.insert(t.path.clone(), t.clone());
                        report.tracks.push(t);
                    }
                }
                Err(e) => report.errors.push(Failure {
                    path: path.to_string_lossy().into(),
                    error: e,
                }),
            }
            progress(i + 1, total);
        }
        report
    }
    pub fn artwork(&self, path: &str) -> Result<Option<String>> {
        if !self.tracks.contains_key(path) {
            return Err("File is not in the library".into());
        }
        let f = lofty::read_from_path(path).map_err(err)?;
        Ok(f.primary_tag()
            .or_else(|| f.first_tag())
            .and_then(|t| t.pictures().first())
            .map(|p| {
                format!(
                    "data:{};base64,{}",
                    p.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg"),
                    STANDARD.encode(p.data())
                )
            }))
    }
    pub fn save(&mut self, mut change: Change) -> Result<Track> {
        let previous = self
            .tracks
            .get(&change.path)
            .ok_or("File is not in the library")?;
        if change.fingerprint != previous.fingerprint {
            return Err("Stale edit; import file again".into());
        }
        for (k, v) in &mut change.fields {
            key(k)?;
            if v.len() > 1_000_000 {
                return Err("Text exceeds 1 MB".into());
            }
            if matches!(k.as_str(), "track" | "disc" | "trackTotal" | "discTotal") && !v.is_empty()
            {
                *v = v
                    .parse::<u32>()
                    .map_err(|_| format!("{k} must be a non-negative integer"))?
                    .to_string();
            }
        }
        let src = PathBuf::from(&change.path);
        if hash(&src)? != change.fingerprint {
            return Err("File changed on disk. Reload before saving.".into());
        }
        let dst = if let Some(n) = &change.new_name {
            validate_name(n)?;
            if Path::new(n).extension().map(|e| e.to_ascii_lowercase())
                != src.extension().map(|e| e.to_ascii_lowercase())
            {
                return Err("Renaming cannot change the audio extension".into());
            }
            src.with_file_name(n)
        } else {
            src.clone()
        };
        if dst != src && dst.exists() {
            return Err("Destination already exists; no files were changed".into());
        }
        let parent = src.parent().ok_or("Missing parent directory")?;
        let mut temp = tempfile::Builder::new()
            .prefix(".tagforge-stage-")
            .suffix(&format!(".{}", src.extension().unwrap().to_string_lossy()))
            .tempfile_in(parent)
            .map_err(err)?;
        let mut source = File::open(&src).map_err(err)?;
        std::io::copy(&mut source, &mut temp).map_err(err)?;
        drop(source);
        let mut audio = lofty::read_from_path(temp.path()).map_err(err)?;
        let kind = audio.primary_tag_type();
        if audio.primary_tag().is_none() {
            audio.insert_tag(Tag::new(kind));
        }
        let tag = audio.primary_tag_mut().ok_or("No writable tag")?;
        for (k, v) in &change.fields {
            let item = key_for(k, kind)?;
            tag.remove_key(item);
            if k == "lyrics" {
                tag.remove_key(ItemKey::Lyrics);
                tag.remove_key(ItemKey::UnsyncLyrics);
            }
            if !v.is_empty() && !tag.insert_text(item, v.clone()) {
                return Err(format!("Field {k} is unsupported by this container"));
            }
        }
        if let Some(art) = &change.artwork {
            // MP4 covr has no picture type; all covr images are album covers.
            // Other containers retain non-front picture types.
            let mut index = tag.pictures().len();
            while index > 0 {
                index -= 1;
                if kind == lofty::tag::TagType::Mp4Ilst
                    || tag.pictures()[index].pic_type() == PictureType::CoverFront
                {
                    tag.remove_picture(index);
                }
            }
            if !art.is_empty() {
                let data = art.split_once(",").ok_or("Invalid image data")?.1;
                let bytes = STANDARD.decode(data).map_err(err)?;
                if bytes.len() > 20 * 1024 * 1024 {
                    return Err("Artwork exceeds 20 MB".into());
                }
                let mut picture =
                    Picture::from_reader(&mut std::io::Cursor::new(bytes)).map_err(err)?;
                picture.set_pic_type(PictureType::CoverFront);
                tag.push_picture(picture);
            }
        }
        tag.save_to_path(temp.path(), WriteOptions::default())
            .map_err(err)?;
        // Keep edited values consistent across writable secondary tags (e.g. WAV RIFF + ID3).
        // Unsupported fields are omitted there; the primary tag above must support every edit.
        let secondary: Vec<_> = audio
            .tags()
            .iter()
            .map(|t| t.tag_type())
            .filter(|t| *t != kind)
            .collect();
        for secondary_kind in secondary {
            if !audio.tag_support(secondary_kind).is_writable() {
                continue;
            }
            let secondary_tag = audio
                .tag_mut(secondary_kind)
                .ok_or("Missing secondary tag")?;
            for (k, v) in &change.fields {
                let item = key_for(k, secondary_kind)?;
                secondary_tag.remove_key(item);
                if k == "lyrics" {
                    secondary_tag.remove_key(ItemKey::Lyrics);
                    secondary_tag.remove_key(ItemKey::UnsyncLyrics);
                }
                if !v.is_empty() {
                    secondary_tag.insert_text(item, v.clone());
                }
            }
            if change.artwork.is_some() {
                let mut index = secondary_tag.pictures().len();
                while index > 0 {
                    index -= 1;
                    if secondary_tag.pictures()[index].pic_type() == PictureType::CoverFront {
                        secondary_tag.remove_picture(index);
                    }
                }
            }
            secondary_tag
                .save_to_path(temp.path(), WriteOptions::default())
                .map_err(err)?;
        }
        temp.as_file_mut().sync_all().map_err(err)?;
        let check = read_track(temp.path())?;
        for (k, v) in &change.fields {
            if check.fields.get(k) != Some(v) {
                return Err(format!("Validation failed for {k}; original untouched"));
            }
        }
        if let Some(art) = &change.artwork {
            let reread = lofty::read_from_path(temp.path()).map_err(err)?;
            let fronts: Vec<_> = reread
                .primary_tag()
                .into_iter()
                .flat_map(|t| t.pictures())
                .filter(|p| {
                    kind == lofty::tag::TagType::Mp4Ilst || p.pic_type() == PictureType::CoverFront
                })
                .collect();
            if art.is_empty() {
                if !fronts.is_empty() {
                    return Err("Container did not remove front artwork; original untouched".into());
                }
            } else {
                let bytes = STANDARD
                    .decode(art.split_once(',').ok_or("Invalid artwork")?.1)
                    .map_err(err)?;
                if !fronts.iter().any(|p| p.data() == bytes.as_slice()) {
                    return Err("Container did not preserve artwork; original untouched".into());
                }
            }
        }
        if hash(&src)? != change.fingerprint {
            return Err("File changed during save; original untouched".into());
        }
        let mut rollback_guard = None;
        let backup = if change.retain_backups {
            let backup = unique_backup(&src);
            copy_exclusive(&src, &backup)?;
            backup
        } else {
            let mut rollback = tempfile::Builder::new()
                .prefix(".tagforge-undo-")
                .suffix(".bak")
                .tempfile_in(parent)
                .map_err(err)?;
            std::io::copy(&mut File::open(&src).map_err(err)?, &mut rollback).map_err(err)?;
            rollback.as_file_mut().sync_all().map_err(err)?;
            let guard = rollback.into_temp_path();
            let path = guard.to_path_buf();
            rollback_guard = Some(guard);
            path
        };
        // Windows replacement requires the staging handle to be closed.
        let temp = temp.into_temp_path();
        if dst == src {
            replace(&temp, &src)?;
        } else {
            // Hard-link publication is no-clobber; if removing source fails, undo destination.
            fs::hard_link(&temp, &dst).map_err(err)?;
            if let Err(e) = fs::remove_file(&src) {
                let _ = fs::remove_file(&dst);
                return Err(err(e));
            }
        }
        let result = read_track(&dst)?;
        self.temporary_backups.extend(rollback_guard);
        self.undo.push(Undo {
            current: dst,
            original: src,
            backup,
            saved_hash: result.fingerprint.clone(),
            original_hash: change.fingerprint,
        });
        self.tracks.remove(&change.path);
        self.tracks.insert(result.path.clone(), result.clone());
        Ok(result)
    }
    pub fn undo_last(&mut self) -> Result<Track> {
        let u = self
            .undo
            .last()
            .ok_or("No saved changes to undo in this session")?
            .clone();
        if hash(&u.current)? != u.saved_hash {
            return Err("File changed since save; undo refused".into());
        }
        if hash(&u.backup)? != u.original_hash {
            return Err("Recovery backup changed; undo refused".into());
        }
        if u.original != u.current && u.original.exists() {
            return Err("Original filename is occupied; undo refused".into());
        }
        let parent = u.current.parent().ok_or("Missing directory")?;
        let temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
        fs::copy(&u.backup, temp.path()).map_err(err)?;
        temp.as_file().sync_all().map_err(err)?;
        let temp = temp.into_temp_path();
        if u.original == u.current {
            replace(&temp, &u.current)?;
        } else {
            fs::hard_link(&temp, &u.original).map_err(err)?;
            if let Err(e) = fs::remove_file(&u.current) {
                let _ = fs::remove_file(&u.original);
                return Err(err(e));
            }
        }
        let t = read_track(&u.original)?;
        self.undo.pop();
        self.tracks.remove(&u.current.to_string_lossy().to_string());
        self.tracks.insert(t.path.clone(), t.clone());
        // An earlier undo for this same file becomes valid again after restoring its bytes.
        Ok(t)
    }
}
fn unique_backup(src: &Path) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    src.with_file_name(format!(
        "{}.tagforge-backup-{stamp}",
        src.file_name().unwrap().to_string_lossy()
    ))
}
fn copy_exclusive(src: &Path, dst: &Path) -> Result<()> {
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dst)
        .map_err(err)?;
    std::io::copy(&mut File::open(src).map_err(err)?, &mut out).map_err(err)?;
    out.flush().map_err(err)?;
    out.sync_all().map_err(err)
}
#[cfg(windows)]
fn replace(staged: &Path, target: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn ReplaceFileW(
            replaced: *const u16,
            replacement: *const u16,
            backup: *const u16,
            flags: u32,
            exclude: *mut std::ffi::c_void,
            reserved: *mut std::ffi::c_void,
        ) -> i32;
    }
    let a: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = staged.as_os_str().encode_wide().chain(Some(0)).collect();
    let ok = unsafe {
        ReplaceFileW(
            a.as_ptr(),
            b.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        Err(err(std::io::Error::last_os_error()))
    } else {
        Ok(())
    }
}
#[cfg(not(windows))]
fn replace(staged: &Path, target: &Path) -> Result<()> {
    fs::rename(staged, target).map_err(err)
}
pub fn validate_name(name: &str) -> Result<()> {
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    if name.is_empty()
        || name.len() > 240
        || name.ends_with(['.', ' '])
        || name.chars().any(|c| c < ' ' || "<>:\"/\\|?*".contains(c))
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        return Err("Unsafe or reserved Windows filename".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn wav(path: &Path) {
        let pcm = vec![0u8; 8820];
        let mut b = Vec::new();
        b.extend(b"RIFF");
        b.extend((36 + pcm.len() as u32).to_le_bytes());
        b.extend(b"WAVEfmt ");
        b.extend(16u32.to_le_bytes());
        b.extend(1u16.to_le_bytes());
        b.extend(1u16.to_le_bytes());
        b.extend(44100u32.to_le_bytes());
        b.extend(88200u32.to_le_bytes());
        b.extend(2u16.to_le_bytes());
        b.extend(16u16.to_le_bytes());
        b.extend(b"data");
        b.extend((pcm.len() as u32).to_le_bytes());
        b.extend(pcm);
        fs::write(path, b).unwrap();
    }
    #[test]
    fn safe_names() {
        for n in [
            "../a.mp3", "CON.wav", "LPT1.mp3", "x?.ogg", "a.mp3.", "a\\b.mp3",
        ] {
            assert!(validate_name(n).is_err(), "{n}");
        }
        assert!(validate_name("01 — Hello.flac").is_ok());
    }
    #[test]
    fn roundtrip_backup_undo_and_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("test.wav");
        wav(&p);
        let original = fs::read(&p).unwrap();
        let mut library = Library::default();
        let report = library.import(vec![p.to_string_lossy().into()], |_, _| {});
        assert!(report.errors.is_empty());
        let t = &report.tracks[0];
        let change = Change {
            path: t.path.clone(),
            fingerprint: t.fingerprint.clone(),
            fields: BTreeMap::from([
                ("title".into(), "Example".into()),
                ("artist".into(), "Composer".into()),
                ("track".into(), "003".into()),
            ]),
            artwork: None,
            new_name: None,
            retain_backups: true,
        };
        let saved = library.save(change.clone()).unwrap();
        assert_eq!(saved.fields["title"], "Example");
        assert_eq!(saved.fields["track"], "3");
        assert_eq!(fs::read(&library.undo[0].backup).unwrap(), original);
        assert!(library.save(change).is_err());
        library.undo_last().unwrap();
        assert_eq!(fs::read(&p).unwrap(), original);
        let t = library.tracks.values().next().unwrap().clone();
        let c = Change {
            path: t.path,
            fingerprint: t.fingerprint,
            fields: BTreeMap::new(),
            artwork: None,
            new_name: Some("occupied.wav".into()),
            retain_backups: true,
        };
        wav(&dir.path().join("occupied.wav"));
        assert!(library.save(c).is_err());
        assert_eq!(fs::read(&p).unwrap(), original);
    }
    #[test]
    fn damaged_file_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("bad.mp3");
        fs::write(&p, b"broken").unwrap();
        let r = Library::default().import(vec![p.to_string_lossy().into()], |_, _| {});
        assert_eq!(r.errors.len(), 1);
        assert!(r.tracks.is_empty());
    }
    #[test]
    fn thousand_file_import_and_repeat_import() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("0.wav");
        wav(&first);
        for i in 1..1000 {
            fs::copy(&first, dir.path().join(format!("{i}.wav"))).unwrap();
        }
        let mut lib = Library::default();
        let mut last = (0, 0);
        let r = lib.import(vec![dir.path().to_string_lossy().into()], |done, total| {
            last = (done, total)
        });
        assert!(r.errors.is_empty());
        assert_eq!(r.tracks.len(), 1000);
        assert_eq!(last, (1000, 1000));
        let again = lib.import(vec![first.to_string_lossy().into()], |_, _| {});
        assert!(again.tracks.is_empty());
        assert_eq!(lib.tracks.len(), 1000);
    }
    #[test]
    fn externally_modified_sources_and_backups_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("test.wav");
        wav(&p);
        let mut lib = Library::default();
        let r = lib.import(vec![p.to_string_lossy().into()], |_, _| {});
        let t = &r.tracks[0];
        let c = Change {
            path: t.path.clone(),
            fingerprint: t.fingerprint.clone(),
            fields: BTreeMap::from([("title".into(), "New".into())]),
            artwork: None,
            new_name: None,
            retain_backups: true,
        };
        let original = fs::read(&p).unwrap();
        let mut modified = original.clone();
        modified[45] = 1;
        fs::write(&p, &modified).unwrap();
        assert!(lib.save(c.clone()).is_err());
        assert_eq!(fs::read(&p).unwrap(), modified);
        fs::write(&p, &original).unwrap();
        lib.save(c).unwrap();
        let saved = fs::read(&p).unwrap();
        fs::write(&lib.undo[0].backup, b"changed backup").unwrap();
        assert!(lib.undo_last().is_err());
        assert_eq!(fs::read(&p).unwrap(), saved);
    }
    #[test]
    fn optional_backups_keep_session_undo_then_clean_up() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("test.wav");
        wav(&p);
        let backup;
        {
            let mut lib = Library::default();
            let r = lib.import(vec![p.to_string_lossy().into()], |_, _| {});
            let t = &r.tracks[0];
            let c = Change {
                path: t.path.clone(),
                fingerprint: t.fingerprint.clone(),
                fields: BTreeMap::from([("title".into(), "Temporary backup".into())]),
                artwork: None,
                new_name: None,
                retain_backups: false,
            };
            lib.save(c).unwrap();
            backup = lib.undo[0].backup.clone();
            assert!(backup.exists());
            lib.undo_last().unwrap();
            lib.clean_temporary_backups();
            assert!(!backup.exists());
        }
        assert!(!backup.exists());
        assert!(p.exists());
    }
}
