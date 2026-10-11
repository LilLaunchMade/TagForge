use crate::{
    core::{Change, ImportReport, Library, Result, Track},
    online,
};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

#[derive(Default)]
struct Store(Mutex<Library>);
#[tauri::command]
async fn choose_paths(folder: bool) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        if folder {
            Ok(rfd::FileDialog::new()
                .pick_folder()
                .into_iter()
                .map(|p| p.to_string_lossy().into())
                .collect())
        } else {
            Ok(rfd::FileDialog::new()
                .add_filter("Music", &["mp3", "flac", "m4a", "wav", "ogg", "opus"])
                .pick_files()
                .unwrap_or_default()
                .into_iter()
                .map(|p| p.to_string_lossy().into())
                .collect())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn import_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<ImportReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Store>();
        let mut lib = state.0.lock().map_err(|e| e.to_string())?;
        Ok(lib.import(paths, |done, total| {
            if done % 20 == 0 || done == total {
                let _ = app.emit("progress", serde_json::json!({"done":done,"total":total}));
            }
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_change(app: tauri::AppHandle, change: Change) -> Result<Track> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Store>()
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .save(change)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn undo_saved(app: tauri::AppHandle) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Store>();
        let mut lib = state.0.lock().map_err(|e| e.to_string())?;
        let path = lib
            .undo
            .last()
            .ok_or("No saved changes to undo")?
            .current
            .to_string_lossy()
            .to_string();
        let track = lib.undo_last()?;
        Ok(serde_json::json!({"previousPath":path,"track":track}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn artwork(app: tauri::AppHandle, path: String) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Store>()
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .artwork(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn clear_library(state: State<Store>) -> Result<()> {
    state.0.lock().map_err(|e| e.to_string())?.tracks.clear();
    Ok(())
}
#[tauri::command]
async fn reload_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<ImportReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Store>();
        let mut lib = state.0.lock().map_err(|e| e.to_string())?;
        let mut report = ImportReport::default();
        for path in paths {
            if !lib.tracks.contains_key(&path) {
                return Err("File is not registered".into());
            }
            match crate::core::read_track(std::path::Path::new(&path)) {
                Ok(t) => {
                    lib.tracks.insert(path, t.clone());
                    report.tracks.push(t);
                }
                Err(error) => report.errors.push(crate::core::Failure { path, error }),
            }
        }
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn search_metadata(query: String, contact: String) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || online::search(&query, &contact))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn fetch_cover(release: String, contact: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || online::cover(&release, &contact))
        .await
        .map_err(|e| e.to_string())?
}
pub fn run() {
    tauri::Builder::default()
        .manage(Store::default())
        .invoke_handler(tauri::generate_handler![
            choose_paths,
            import_paths,
            save_change,
            undo_saved,
            artwork,
            clear_library,
            reload_paths,
            search_metadata,
            fetch_cover
        ])
        .build(tauri::generate_context!())
        .expect("Unable to start TagForge")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                let state = app.state::<Store>();
                let result = state.0.lock();
                if let Ok(mut lib) = result {
                    lib.clean_temporary_backups();
                }
            }
        });
}
