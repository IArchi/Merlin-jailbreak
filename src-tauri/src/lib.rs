use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ColorType, ImageReader};
#[cfg(unix)]
use libc::statvfs;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

fn should_skip_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            matches!(
                name,
                ".Spotlight-V100" | ".Trashes" | ".fseventsd" | ".TemporaryItems"
            )
        })
        .unwrap_or(false)
}

fn is_supported_import_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp3" | "jpg" | "jpeg" | "png" | "bmp" | "webp" | "bin" | "cfg"
            )
        })
        .unwrap_or(false)
}

fn lowercase_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
}

fn is_supported_image_extension(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "bmp" | "webp")
}

fn normalize_image_relative_path(path: &Path) -> PathBuf {
    match lowercase_extension(path).as_deref() {
        Some("jpg") => path.to_path_buf(),
        Some("jpeg" | "png" | "bmp" | "webp") => path.with_extension("jpg"),
        _ => path.to_path_buf(),
    }
}

fn should_convert_image_to_jpg(source: &Path, destination: &Path) -> bool {
    matches!(lowercase_extension(destination).as_deref(), Some("jpg" | "jpeg"))
        && !matches!(lowercase_extension(source).as_deref(), Some("jpg"))
}

fn validate_workspace_copy(source: &Path, destination: &Path) -> Result<(), String> {
    let source_ext = lowercase_extension(source);

    match lowercase_extension(destination).as_deref() {
        Some("mp3") => {
            if source_ext.as_deref() != Some("mp3") {
                return Err(format!(
                    "Le fichier audio \"{}\" doit être au format mp3.",
                    source.display()
                ));
            }
        }
        Some("jpg" | "jpeg") => {
            let is_supported = source_ext
                .as_deref()
                .map(is_supported_image_extension)
                .unwrap_or(false);

            if !is_supported {
                return Err(format!(
                    "L'image \"{}\" doit être au format jpg, jpeg, png, bmp ou webp.",
                    source.display()
                ));
            }
        }
        _ => {}
    }

    Ok(())
}

fn should_encode_image_as_jpg(source: &Path, destination: &Path) -> bool {
    matches!(lowercase_extension(destination).as_deref(), Some("jpg" | "jpeg"))
        && lowercase_extension(source)
            .as_deref()
            .map(is_supported_image_extension)
            .unwrap_or(false)
}

fn is_mp3_file(path: &Path) -> bool {
    matches!(lowercase_extension(path).as_deref(), Some("mp3"))
}

fn is_supported_image_file(path: &Path) -> bool {
    lowercase_extension(path)
        .as_deref()
        .map(is_supported_image_extension)
        .unwrap_or(false)
}

fn sorted_dir_paths(path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?
        .map(|entry| {
            entry
                .map(|value| value.path())
                .map_err(|e| format!("Failed to read directory entry in {}: {}", path.display(), e))
        })
        .collect::<Result<Vec<_>, _>>()?;

    entries.sort_by(|left, right| {
        let left_name = left
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_ascii_lowercase())
            .unwrap_or_default();
        let right_name = right
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_ascii_lowercase())
            .unwrap_or_default();

        left_name.cmp(&right_name)
    });

    Ok(entries)
}

fn collect_audio_album_imports(path: &Path, imports: &mut Vec<AudioImportCandidate>) -> Result<(), String> {
    for entry in sorted_dir_paths(path)? {
        if !entry.is_dir() || should_skip_dir(&entry) {
            continue;
        }

        let mut mp3_files = Vec::new();
        let mut image_files = Vec::new();

        for child in sorted_dir_paths(&entry)? {
            if !child.is_file() {
                continue;
            }

            if is_mp3_file(&child) {
                mp3_files.push(child);
            } else if is_supported_image_file(&child) {
                image_files.push(child);
            }
        }

        if let (Some(mp3_path), Some(image_path)) = (mp3_files.first(), image_files.first()) {
            let title = entry
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| {
                    mp3_path
                        .file_stem()
                        .and_then(|name| name.to_str())
                        .map(|name| name.to_string())
                        .unwrap_or_else(|| "Piste audio".to_string())
                });

            imports.push(AudioImportCandidate {
                source_path: mp3_path.to_string_lossy().to_string(),
                title,
                image_source_path: Some(image_path.to_string_lossy().to_string()),
            });
        }

        collect_audio_album_imports(&entry, imports)?;
    }

    Ok(())
}

fn encode_image_as_jpg(source: &Path, destination: &Path, resize_to_thumbnail: bool) -> Result<u64, String> {
    let reader = ImageReader::open(source)
        .map_err(|e| format!("Failed to open image {}: {}", source.display(), e))?;
    let mut decoded = reader
        .with_guessed_format()
        .map_err(|e| format!("Failed to detect image format for {}: {}", source.display(), e))?
        .decode()
        .map_err(|e| format!("Failed to decode image {}: {}", source.display(), e))?;

    if resize_to_thumbnail {
        decoded = decoded.resize_to_fill(128, 128, FilterType::Lanczos3);
    }

    let rgb = decoded.to_rgb8();

    let mut encoded = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut encoded, 90);
    encoder
        .encode(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
        .map_err(|e| format!("Failed to encode image {} as jpg: {}", source.display(), e))?;

    fs::write(destination, &encoded)
        .map_err(|e| format!("Failed to write destination file {}: {}", destination.display(), e))?;

    Ok(encoded.len() as u64)
}

fn copy_asset_to_path_with_options(source: &Path, destination: &Path, resize_to_thumbnail: bool) -> Result<u64, String> {
    validate_workspace_copy(source, destination)?;

    if should_encode_image_as_jpg(source, destination) {
        return encode_image_as_jpg(source, destination, resize_to_thumbnail);
    }

    fs::copy(source, destination)
        .map_err(|e| format!("Failed to copy {} to {}: {}", source.display(), destination.display(), e))
}

#[derive(Serialize)]
pub struct PlaylistFileResult {
    data: Vec<u8>,
    base_path: String,
}

#[derive(Serialize)]
struct WorkspaceStatus {
    root: String,
    exists: bool,
    non_empty: bool,
    playlist_path: Option<String>,
    temp_exists: bool,
    temp_non_empty: bool,
    can_reopen: bool,
}

#[derive(Serialize)]
struct WorkspaceOpenResult {
    root: String,
    playlist_path: String,
    base_path: String,
}

#[derive(Serialize, Clone)]
struct WorkspaceProgress {
    phase: String,
    total_files: u64,
    done_files: u64,
    total_bytes: u64,
    done_bytes: u64,
    current_rel_path: Option<String>,
}

#[derive(Serialize)]
struct WorkspaceTransferResult {
    root: String,
    playlist_path: String,
    base_path: String,
    total_files: u64,
    total_bytes: u64,
}

#[derive(Serialize)]
struct AudioImportCandidate {
    source_path: String,
    title: String,
    image_source_path: Option<String>,
}

#[derive(serde::Deserialize)]
struct ExportWorkspaceRequest {
    destination_dir: String,
    playlist_data: Vec<u8>,
    asset_paths: Vec<String>,
}

#[derive(serde::Deserialize)]
struct ExportCapacityRequest {
    destination_dir: String,
    playlist_size: u64,
    asset_paths: Vec<String>,
}

#[derive(Serialize)]
struct ExportCapacity {
    required_bytes: u64,
    available_bytes: u64,
}

#[derive(Clone)]
struct CopyPlanEntry {
    source: PathBuf,
    relative: PathBuf,
    size: u64,
}

const WORKSPACE_DIR_NAME: &str = "import";
const TEMP_WORKSPACE_DIR_NAME: &str = "import.tmp";
const WORKSPACE_PROGRESS_EVENT: &str = "workspace-progress";

fn workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app local data dir: {}", e))
        .map(|path| path.join(WORKSPACE_DIR_NAME))
}

fn workspace_temp_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app local data dir: {}", e))
        .map(|path| path.join(TEMP_WORKSPACE_DIR_NAME))
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|e| format!("Failed to create directory {}: {}", path.display(), e))
}

fn available_bytes(path: &Path) -> Result<u64, String> {
    #[cfg(unix)]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let path_bytes = path.as_os_str().as_bytes();
        let c_path = CString::new(path_bytes)
            .map_err(|_| format!("Invalid path for free-space check: {}", path.display()))?;
        let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();

        let result = unsafe { statvfs(c_path.as_ptr(), stats.as_mut_ptr()) };
        if result != 0 {
            return Err(format!(
                "Failed to read free space for {}: {}",
                path.display(),
                std::io::Error::last_os_error()
            ));
        }

        let stats = unsafe { stats.assume_init() };
        let fragment_size = if stats.f_frsize > 0 {
            stats.f_frsize as u64
        } else {
            stats.f_bsize as u64
        };

        return Ok(fragment_size.saturating_mul(stats.f_bavail as u64));
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;

        let wide_path = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>();
        let mut free_bytes_available = 0_u64;

        let result = unsafe {
            GetDiskFreeSpaceExW(
                wide_path.as_ptr(),
                &mut free_bytes_available,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };

        if result == 0 {
            return Err(format!(
                "Failed to read free space for {}: {}",
                path.display(),
                std::io::Error::last_os_error()
            ));
        }

        return Ok(free_bytes_available);
    }

    #[allow(unreachable_code)]
    Err(format!(
        "Free-space check is not supported on this platform for {}",
        path.display()
    ))
}

fn export_entries(workspace: &Path, asset_paths: Vec<String>) -> Result<Vec<CopyPlanEntry>, String> {
    let mut entries = Vec::new();

    if workspace.exists() {
        for entry in fs::read_dir(workspace)
            .map_err(|e| format!("Failed to read workspace {}: {}", workspace.display(), e))?
        {
            let entry = entry.map_err(|e| format!("Failed to inspect workspace entry: {}", e))?;
            let path = entry.path();
            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

            if metadata.is_file() {
                let extension = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.to_ascii_lowercase());

                if extension.as_deref() == Some("cfg") {
                    entries.push(CopyPlanEntry {
                        relative: PathBuf::from(entry.file_name()),
                        source: path,
                        size: metadata.len(),
                    });
                }
            }
        }
    }

    let mut unique_assets = std::collections::BTreeSet::new();
    for asset_path in asset_paths {
        if asset_path.trim().is_empty() {
            continue;
        }

        unique_assets.insert(asset_path);
    }

    for asset_path in unique_assets {
        let source = PathBuf::from(&asset_path);
        if !source.exists() {
            continue;
        }

        let metadata = source
            .metadata()
            .map_err(|e| format!("Failed to read metadata for {}: {}", source.display(), e))?;

        if !metadata.is_file() {
            continue;
        }

        let file_name = source
            .file_name()
            .ok_or_else(|| format!("Invalid asset path: {}", source.display()))?
            .to_os_string();

        entries.push(CopyPlanEntry {
            relative: PathBuf::from(file_name),
            source,
            size: metadata.len(),
        });
    }

    Ok(entries)
}

fn required_export_bytes(workspace: &Path, playlist_size: u64, asset_paths: Vec<String>) -> Result<u64, String> {
    Ok(
        playlist_size
            + export_entries(workspace, asset_paths)?
                .iter()
                .map(|entry| entry.size)
                .sum::<u64>(),
    )
}

fn clear_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to remove directory {}: {}", path.display(), e))
    } else {
        fs::remove_file(path)
            .map_err(|e| format!("Failed to remove file {}: {}", path.display(), e))
    }
}

fn dir_has_entries(path: &Path) -> Result<bool, String> {
    if !path.exists() || !path.is_dir() {
        return Ok(false);
    }

    let mut entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

    Ok(entries.next().is_some())
}

fn collect_files(root: &Path) -> Result<Vec<CopyPlanEntry>, String> {
    let mut entries = Vec::new();
    collect_files_recursive(root, root, &mut entries)?;
    Ok(entries)
}

fn collect_files_recursive(root: &Path, current: &Path, entries: &mut Vec<CopyPlanEntry>) -> Result<(), String> {
    let read_dir = match fs::read_dir(current) {
        Ok(read_dir) => read_dir,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("Skipping unreadable directory {}: {}", current.display(), error);
            return Ok(());
        }
        Err(error) => {
            return Err(format!("Failed to read directory {}: {}", current.display(), error));
        }
    };

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to inspect directory entry: {}", e))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

        if metadata.is_dir() {
            if should_skip_dir(&path) {
                continue;
            }

            collect_files_recursive(root, &path, entries)?;
            continue;
        }

        if metadata.is_file() {
            if !is_supported_import_file(&path) {
                continue;
            }

            let relative = path
                .strip_prefix(root)
                .map_err(|e| format!("Failed to compute relative path for {}: {}", path.display(), e))?
                .to_path_buf();
            let relative = normalize_image_relative_path(&relative);

            entries.push(CopyPlanEntry {
                source: path,
                relative,
                size: metadata.len(),
            });
        }
    }

    Ok(())
}

fn emit_progress(app: &AppHandle, progress: &WorkspaceProgress) -> Result<(), String> {
    println!(
        "[progress][backend] emit phase={} files={}/{} bytes={}/{} current={}",
        progress.phase,
        progress.done_files,
        progress.total_files,
        progress.done_bytes,
        progress.total_bytes,
        progress.current_rel_path.as_deref().unwrap_or("(none)")
    );

    app.emit(WORKSPACE_PROGRESS_EVENT, progress.clone())
        .map_err(|e| format!("Failed to emit progress event: {}", e))
}

fn perform_import_workspace(app: AppHandle, source_dir: String) -> Result<WorkspaceTransferResult, String> {
    println!("[progress][backend] import worker started source={}", source_dir);
    let source_root = PathBuf::from(&source_dir);
    if !source_root.is_dir() {
        return Err(format!("Source directory does not exist: {}", source_root.display()));
    }

    let source_playlist = source_root.join("playlist.bin");
    if !source_playlist.exists() {
        return Err("The selected directory does not contain playlist.bin".to_string());
    }

    let workspace = workspace_root(&app)?;
    let temp_workspace = workspace_temp_root(&app)?;
    let app_local_dir = temp_workspace
        .parent()
        .ok_or_else(|| "Invalid workspace parent directory".to_string())?;

    ensure_dir(app_local_dir)?;
    clear_path(&temp_workspace)?;

    println!(
        "[progress][backend] import collecting files source={} temp={}",
        source_root.display(),
        temp_workspace.display()
    );
    let entries = collect_files(&source_root)?;
    let mut entries = entries;

    if !entries.iter().any(|entry| entry.relative == PathBuf::from("playlist.bin")) {
        let metadata = source_playlist
            .metadata()
            .map_err(|e| format!("Failed to read metadata for {}: {}", source_playlist.display(), e))?;

        entries.push(CopyPlanEntry {
            source: source_playlist.clone(),
            relative: PathBuf::from("playlist.bin"),
            size: metadata.len(),
        });
    }

    println!(
        "[progress][backend] import collected files count={}",
        entries.len()
    );
    let (total_files, total_bytes) = copy_plan_to_dir(&app, "copy", &entries, &temp_workspace)?;

    clear_path(&workspace)?;
    fs::rename(&temp_workspace, &workspace)
        .map_err(|e| format!("Failed to finalize workspace: {}", e))?;

    let playlist_path = workspace.join("playlist.bin");

    if !playlist_path.exists() {
        return Err(format!(
            "Import completed without playlist.bin in workspace {}",
            workspace.display()
        ));
    }

    println!(
        "[progress][backend] import finalized root={} playlist={} total_files={} total_bytes={}",
        workspace.display(),
        playlist_path.display(),
        total_files,
        total_bytes
    );

    Ok(WorkspaceTransferResult {
        root: workspace.to_string_lossy().to_string(),
        playlist_path: playlist_path.to_string_lossy().to_string(),
        base_path: workspace.to_string_lossy().to_string(),
        total_files,
        total_bytes,
    })
}

fn perform_export_workspace(app: AppHandle, request: ExportWorkspaceRequest) -> Result<WorkspaceTransferResult, String> {
    let workspace = workspace_root(&app)?;
    let destination = PathBuf::from(&request.destination_dir);

    ensure_dir(&destination)?;

    let required_bytes = required_export_bytes(&workspace, request.playlist_data.len() as u64, request.asset_paths.clone())?;
    let available_bytes = available_bytes(&destination)?;
    if available_bytes < required_bytes {
        return Err(format!(
            "Espace insuffisant sur le volume de destination (requis: {} octets, disponible: {} octets).",
            required_bytes,
            available_bytes
        ));
    }

    let playlist_path = destination.join("playlist.bin");
    fs::write(&playlist_path, request.playlist_data)
        .map_err(|e| format!("Failed to write playlist.bin: {}", e))?;

    let entries = export_entries(&workspace, request.asset_paths)?;

    let (total_files, total_bytes) = copy_plan_to_dir(&app, "export", &entries, &destination)?;

    Ok(WorkspaceTransferResult {
        root: destination.to_string_lossy().to_string(),
        playlist_path: playlist_path.to_string_lossy().to_string(),
        base_path: destination.to_string_lossy().to_string(),
        total_files,
        total_bytes,
    })
}

fn copy_file_with_progress(
    app: &AppHandle,
    phase: &str,
    source: &Path,
    destination: &Path,
    relative: &Path,
    total_files: u64,
    done_files: &mut u64,
    total_bytes: u64,
    done_bytes: &mut u64,
) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        ensure_dir(parent)?;
    }

    validate_workspace_copy(source, destination)?;

    let current_rel_path = Some(relative.to_string_lossy().to_string());

    if should_convert_image_to_jpg(source, destination) {
        let bytes_written = encode_image_as_jpg(source, destination, false)?;
        *done_bytes += bytes_written;
        *done_files += 1;

        emit_progress(
            app,
            &WorkspaceProgress {
                phase: phase.to_string(),
                total_files,
                done_files: *done_files,
                total_bytes,
                done_bytes: *done_bytes,
                current_rel_path,
            },
        )?;

        return Ok(());
    }

    let mut input = fs::File::open(source)
        .map_err(|e| format!("Failed to open source file {}: {}", source.display(), e))?;
    let mut output = fs::File::create(destination)
        .map_err(|e| format!("Failed to create destination file {}: {}", destination.display(), e))?;
    let mut buffer = vec![0_u8; 1024 * 1024];

    loop {
        let bytes_read = input
            .read(&mut buffer)
            .map_err(|e| format!("Failed while reading {}: {}", source.display(), e))?;

        if bytes_read == 0 {
            break;
        }

        output
            .write_all(&buffer[..bytes_read])
            .map_err(|e| format!("Failed while writing {}: {}", destination.display(), e))?;

        *done_bytes += bytes_read as u64;

        emit_progress(
            app,
            &WorkspaceProgress {
                phase: phase.to_string(),
                total_files,
                done_files: *done_files,
                total_bytes,
                done_bytes: *done_bytes,
                current_rel_path: current_rel_path.clone(),
            },
        )?;
    }

    *done_files += 1;

    emit_progress(
        app,
        &WorkspaceProgress {
            phase: phase.to_string(),
            total_files,
            done_files: *done_files,
            total_bytes,
            done_bytes: *done_bytes,
            current_rel_path,
        },
    )?;

    Ok(())
}

fn copy_plan_to_dir(app: &AppHandle, phase: &str, entries: &[CopyPlanEntry], destination_root: &Path) -> Result<(u64, u64), String> {
    let total_files = entries.len() as u64;
    let total_bytes = entries.iter().map(|entry| entry.size).sum::<u64>();
    let mut done_files = 0_u64;
    let mut done_bytes = 0_u64;

    println!(
        "[progress][backend] copy_plan phase={} total_files={} total_bytes={} destination={}",
        phase,
        total_files,
        total_bytes,
        destination_root.display()
    );

    emit_progress(
        app,
        &WorkspaceProgress {
            phase: "scan".to_string(),
            total_files,
            done_files,
            total_bytes,
            done_bytes,
            current_rel_path: None,
        },
    )?;

    for entry in entries {
        let destination = destination_root.join(&entry.relative);
        copy_file_with_progress(
            app,
            phase,
            &entry.source,
            &destination,
            &entry.relative,
            total_files,
            &mut done_files,
            total_bytes,
            &mut done_bytes,
        )?;
    }

    Ok((total_files, total_bytes))
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

/// Return the subset of paths that do not exist on disk
#[tauri::command]
fn find_missing_paths(paths: Vec<String>) -> Vec<String> {
    paths
        .into_iter()
        .filter(|path| !Path::new(path).exists())
        .collect()
}

#[tauri::command]
fn get_workspace_status(app: AppHandle) -> Result<WorkspaceStatus, String> {
    let root = workspace_root(&app)?;
    let temp_root = workspace_temp_root(&app)?;
    let exists = root.exists();
    let non_empty = dir_has_entries(&root)?;
    let playlist_path = root.join("playlist.bin");
    let temp_exists = temp_root.exists();
    let temp_non_empty = dir_has_entries(&temp_root)?;
    let playlist_path = if playlist_path.exists() {
        Some(playlist_path.to_string_lossy().to_string())
    } else {
        None
    };
    let can_reopen = playlist_path.is_some() && !temp_non_empty;

    Ok(WorkspaceStatus {
        root: root.to_string_lossy().to_string(),
        exists,
        non_empty,
        playlist_path,
        temp_exists,
        temp_non_empty,
        can_reopen,
    })
}

#[tauri::command]
fn reopen_workspace(app: AppHandle) -> Result<WorkspaceOpenResult, String> {
    let root = workspace_root(&app)?;
    let playlist_path = root.join("playlist.bin");

    if !playlist_path.exists() {
        return Err("Workspace does not contain playlist.bin".to_string());
    }

    Ok(WorkspaceOpenResult {
        root: root.to_string_lossy().to_string(),
        playlist_path: playlist_path.to_string_lossy().to_string(),
        base_path: root.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn clear_workspace(app: AppHandle) -> Result<(), String> {
    let root = workspace_root(&app)?;
    clear_path(&root)
}

#[tauri::command]
fn scan_audio_import_directory(source_dir: String) -> Result<Vec<AudioImportCandidate>, String> {
    let root = PathBuf::from(&source_dir);

    if !root.exists() {
        return Err(format!("Source directory does not exist: {}", root.display()));
    }

    if !root.is_dir() {
        return Err(format!("Source path is not a directory: {}", root.display()));
    }

    let mut imports = Vec::new();

    for entry in sorted_dir_paths(&root)? {
        if !entry.is_file() || !is_mp3_file(&entry) {
            continue;
        }

        let title = entry
            .file_stem()
            .and_then(|name| name.to_str())
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "Piste audio".to_string());

        imports.push(AudioImportCandidate {
            source_path: entry.to_string_lossy().to_string(),
            title,
            image_source_path: None,
        });
    }

    collect_audio_album_imports(&root, &mut imports)?;

    Ok(imports)
}

#[tauri::command]
fn copy_file_to_workspace(
    app: AppHandle,
    source_path: String,
    file_name: String,
    resize_image: bool,
) -> Result<String, String> {
    let root = workspace_root(&app)?;
    ensure_dir(&root)?;

    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", source.display()));
    }

    let destination = root.join(file_name);
    if let Some(parent) = destination.parent() {
        ensure_dir(parent)?;
    }

    copy_asset_to_path_with_options(&source, &destination, resize_image)?;

    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
async fn import_workspace(app: AppHandle, source_dir: String) -> Result<WorkspaceTransferResult, String> {
    println!("[progress][backend] import requested source={}", source_dir);

    let result = tauri::async_runtime::spawn_blocking(move || perform_import_workspace(app, source_dir))
        .await
        .map_err(|e| format!("Import worker task failed: {}", e))?;

    if let Ok(ref value) = result {
        println!(
            "[progress][backend] import completed root={} playlist={}",
            value.root,
            value.playlist_path
        );
    }

    result
}

#[tauri::command]
fn get_export_capacity(app: AppHandle, request: ExportCapacityRequest) -> Result<ExportCapacity, String> {
    let destination = PathBuf::from(&request.destination_dir);
    ensure_dir(&destination)?;

    let workspace = workspace_root(&app)?;
    let required_bytes = required_export_bytes(&workspace, request.playlist_size, request.asset_paths)?;
    let available_bytes = available_bytes(&destination)?;

    Ok(ExportCapacity {
        required_bytes,
        available_bytes,
    })
}

#[tauri::command]
async fn export_workspace(app: AppHandle, request: ExportWorkspaceRequest) -> Result<WorkspaceTransferResult, String> {
    tauri::async_runtime::spawn_blocking(move || perform_export_workspace(app, request))
        .await
        .map_err(|e| format!("Export worker task failed: {}", e))?
}

/// Write a playlist bin file
#[tauri::command]
fn write_playlist_file(path: &str, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        ensure_dir(parent)?;
    }

    fs::write(path, data)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn write_workspace_playlist(app: AppHandle, data: Vec<u8>) -> Result<String, String> {
    let root = workspace_root(&app)?;
    ensure_dir(&root)?;

    let playlist_path = root.join("playlist.bin");
    fs::write(&playlist_path, data)
        .map_err(|e| format!("Failed to write workspace playlist.bin: {}", e))?;

    Ok(playlist_path.to_string_lossy().to_string())
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
            find_missing_paths,
            get_workspace_status,
            reopen_workspace,
            clear_workspace,
            scan_audio_import_directory,
            copy_file_to_workspace,
            import_workspace,
            export_workspace,
            get_export_capacity,
            write_playlist_file,
            write_workspace_playlist,
            read_asset_file,
            write_asset_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
