use std::fs;
use std::path::Path;
use serde::Serialize;

#[derive(Serialize)]
pub struct PlaylistFileResult {
    data: Vec<u8>,
    base_path: String,
}

/// Read a playlist bin file
#[tauri::command]
fn read_playlist_file(path: &str) -> Result<PlaylistFileResult, String> {
    let file_path = Path::new(path);
    
    let data = fs::read(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Get the directory containing the playlist file as base path
    let base_path = file_path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    
    Ok(PlaylistFileResult { data, base_path })
}

/// Write a playlist bin file
#[tauri::command]
fn write_playlist_file(path: &str, data: Vec<u8>) -> Result<(), String> {
    fs::write(path, data)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Read an asset file (image or audio)
#[tauri::command]
fn read_asset_file(path: &str) -> Result<Vec<u8>, String> {
    fs::read(path)
        .map_err(|e| format!("Failed to read asset: {}", e))
}

/// Write an asset file
#[tauri::command]
fn write_asset_file(path: &str, data: Vec<u8>) -> Result<(), String> {
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    
    fs::write(path, data)
        .map_err(|e| format!("Failed to write asset: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_playlist_file,
            write_playlist_file,
            read_asset_file,
            write_asset_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
