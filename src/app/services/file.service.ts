import { Injectable, effect, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { basename } from '@tauri-apps/api/path';
import { confirm, message, open } from '@tauri-apps/plugin-dialog';
import { PlaylistService } from './playlist.service';
import {
  AudioImportCandidate,
  OperationProgress,
  WorkspaceOpenResult,
  WorkspaceProgress,
  WorkspaceStatus,
  WorkspaceTransferResult
} from '../models/playlist-item.model';

interface MissingPlaylistAsset {
  itemId: number;
  title: string;
  missingKinds: string[];
}

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private static readonly WORKSPACE_PROGRESS_EVENT = 'workspace-progress';
  private static readonly LOG_PREFIX = '[progress]';
  private static readonly SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'webp'];

  private playlistService = inject(PlaylistService);
  private progressUnlisten: Promise<UnlistenFn> | null = null;
  private isClosing = false;
  private progressEventCount = 0;
  private isPersistingWorkspacePlaylist = false;
  private lastPersistedWorkspacePlaylistSignature: string | null = null;
  private pendingWorkspacePlaylistWrite: { signature: string; data: number[] } | null = null;

  readonly operationInProgress = signal(false);
  readonly progress = signal<WorkspaceProgress | null>(null);
  readonly progressLabel = signal('');
  readonly operationDetail = signal('');

  constructor() {
    this.progressUnlisten = listen<WorkspaceProgress>(FileService.WORKSPACE_PROGRESS_EVENT, event => {
      this.progressEventCount += 1;
      console.info(
        FileService.LOG_PREFIX,
        'event',
        this.progressEventCount,
        event.payload.phase,
        `${event.payload.done_files}/${event.payload.total_files}`,
        `${event.payload.done_bytes}/${event.payload.total_bytes}`,
        event.payload.current_rel_path ?? '(none)'
      );
      this.progress.set(event.payload);
    });

    effect(() => {
      const workspacePath = this.playlistService.workspacePath();
      const items = this.playlistService.getFlattenedItems();

      if (!workspacePath || items.length === 0) {
        return;
      }

      const signature = JSON.stringify(items);
      if (
        signature === this.lastPersistedWorkspacePlaylistSignature ||
        signature === this.pendingWorkspacePlaylistWrite?.signature
      ) {
        return;
      }

      const buffer = this.playlistService.exportToBinary(items);
      this.pendingWorkspacePlaylistWrite = {
        signature,
        data: Array.from(new Uint8Array(buffer))
      };

      void this.flushWorkspacePlaylistWrites();
    });
  }

  async initializeWorkspaceRecovery(): Promise<void> {
    try {
      const status = await this.getWorkspaceStatus();
      this.playlistService.setWorkspacePath(status.root);

      if (!status.non_empty && !status.temp_non_empty) {
        return;
      }

      if (!status.can_reopen) {
        console.warn('Workspace recovery skipped: workspace is incomplete or import was interrupted', status);
        return;
      }

      const shouldReopen = await confirm(
        'Une playlist est déjà en cours d\'édition. Voulez-vous la rouvrir ?',
        {
          title: 'Rouvrir la dernière playlist',
          kind: 'info',
          okLabel: 'Rouvrir',
          cancelLabel: 'Ignorer'
        }
      );

      if (!shouldReopen) {
        return;
      }

      await this.reopenWorkspace();
    } catch (error) {
      console.error('Error initializing workspace recovery:', error);
    }
  }

  async installCloseHandler(): Promise<void> {
    const appWindow = getCurrentWindow();

    await appWindow.onCloseRequested(async event => {
      if (this.isClosing) {
        event.preventDefault();
        return;
      }

      const status = await this.getWorkspaceStatus();
      if (!status.non_empty) {
        return;
      }

      event.preventDefault();

      const shouldDelete = await confirm(
        'Voulez-vous supprimer le dossier importé avant de fermer l\'application ?',
        {
          title: 'Fermer Merlin JailBreak',
          kind: 'warning',
          okLabel: 'Supprimer et fermer',
          cancelLabel: 'Conserver et fermer'
        }
      );

      this.isClosing = true;

      try {
        if (shouldDelete) {
          await invoke('clear_workspace');
        }

        await appWindow.destroy();
      } catch (error) {
        this.isClosing = false;
        console.error('Error while closing application:', error);
      }
    });
  }

  async openPlaylistDirectory(): Promise<void> {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (!selected || typeof selected !== 'string') {
        console.info(FileService.LOG_PREFIX, 'import cancelled or invalid selection', selected);
        return;
      }

      console.info(FileService.LOG_PREFIX, 'import selected', selected);
      this.beginProgress('Import du dossier en cours...', 'Scan du dossier source...');
      await this.flushUi();
      console.info(FileService.LOG_PREFIX, 'import overlay painted, invoking backend');
      const result = await invoke<WorkspaceTransferResult>('import_workspace', {
        sourceDir: selected
      });
      console.info(FileService.LOG_PREFIX, 'import backend completed', result);

      await this.loadWorkspacePlaylist(result);
      await this.handleMissingImportedAssets();
    } catch (error) {
      console.error('Error opening playlist directory:', error);
      await message(
        this.getErrorMessage(error, 'L\'import du dossier a échoué.'),
        {
          title: 'Import impossible',
          kind: 'error',
          okLabel: 'Fermer'
        }
      );
    } finally {
      this.endProgress();
    }
  }

  async reopenWorkspace(): Promise<void> {
    try {
      this.beginProgress('Réouverture du dossier importé...', 'Chargement de playlist.bin...');
      await this.flushUi();
      console.info(FileService.LOG_PREFIX, 'reopen overlay painted, invoking backend');
      const result = await invoke<WorkspaceOpenResult>('reopen_workspace');
      console.info(FileService.LOG_PREFIX, 'reopen backend completed', result);
      const playlistPath = result.playlist_path;
      const readResult = await invoke<{ data: number[]; base_path: string }>('read_playlist_file', {
        path: playlistPath
      });

      const buffer = new Uint8Array(readResult.data).buffer;
      this.playlistService.loadPlaylist(buffer, playlistPath, result.base_path, result.root);
      await this.handleMissingImportedAssets();
    } catch (error) {
      console.error('Error reopening workspace:', error);
    } finally {
      this.endProgress();
    }
  }

  async exportFile(): Promise<void> {
    try {
      if (!await this.ensureRequiredThumbnails()) {
        return;
      }

      const selected = await open({
        directory: true,
        multiple: false
      });

      if (!selected || typeof selected !== 'string') {
        console.info(FileService.LOG_PREFIX, 'export cancelled or invalid selection', selected);
        return;
      }

      console.info(FileService.LOG_PREFIX, 'export selected', selected);
      this.beginProgress('Export du dossier Merlin en cours...', 'Préparation des fichiers à copier...');
      await this.flushUi();
      console.info(FileService.LOG_PREFIX, 'export overlay painted, invoking backend');

      const items = this.playlistService.getFlattenedItems();
      const buffer = this.playlistService.exportToBinary(items);
      const data = Array.from(new Uint8Array(buffer));

      await invoke<WorkspaceTransferResult>('export_workspace', {
        request: {
          destination_dir: selected,
          playlist_data: data,
          asset_paths: this.playlistService.getExportAssetPaths()
        }
      });
      console.info(FileService.LOG_PREFIX, 'export backend completed');

      this.playlistService.markAsSaved();
    } catch (error) {
      console.error('Error exporting workspace:', error);
      await message(
        this.getErrorMessage(error, 'L\'export du dossier a échoué.'),
        {
          title: 'Export impossible',
          kind: 'error',
          okLabel: 'Fermer'
        }
      );
    } finally {
      this.endProgress();
    }
  }

  async readAsset(path: string): Promise<string | null> {
    try {
      const data = await invoke<number[]>('read_asset_file', { path });
      const uint8Array = new Uint8Array(data);

      const ext = path.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'bmp') mimeType = 'image/bmp';
      else if (ext === 'mp3') mimeType = 'audio/mpeg';

      const blob = new Blob([uint8Array], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error reading asset:', error);
      return null;
    }
  }

  async selectImage(): Promise<string | null> {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp']
        }]
      });

      if (selected && typeof selected === 'string') {
        return selected;
      }
      return null;
    } catch (error) {
      console.error('Error selecting image:', error);
      return null;
    }
  }

  async selectAudioFiles(): Promise<string[]> {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Audio',
          extensions: ['mp3']
        }]
      });

      if (!selected) {
        return [];
      }

      if (typeof selected === 'string') {
        return [selected];
      }

      return selected.filter((path): path is string => typeof path === 'string');
    } catch (error) {
      console.error('Error selecting audio files:', error);
      return [];
    }
  }

  async selectAudioImportDirectory(): Promise<string | null> {
    try {
      const selected = await open({
        directory: true,
        recursive: true,
        multiple: false,
        title: 'Sélectionner un dossier à importer'
      });

      if (selected && typeof selected === 'string') {
        return selected;
      }

      return null;
    } catch (error) {
      console.error('Error selecting audio import directory:', error);
      return null;
    }
  }

  async scanAudioImportDirectory(sourceDir: string): Promise<AudioImportCandidate[]> {
    try {
      return await invoke<AudioImportCandidate[]>('scan_audio_import_directory', { sourceDir });
    } catch (error) {
      console.error('Error scanning audio import directory:', error);
      throw error;
    }
  }

  async importAudioToWorkspace(filePaths: string[], targetPaths: string[]): Promise<Array<{ sourcePath: string; workspacePath: string }>> {
    const imported: Array<{ sourcePath: string; workspacePath: string }> = [];

    for (let index = 0; index < filePaths.length; index += 1) {
      const sourcePath = filePaths[index];
      const targetPath = targetPaths[index];

      if (!sourcePath || !targetPath) {
        continue;
      }

      const workspaceFileName = await basename(targetPath);
      const workspacePath = await invoke<string>('copy_file_to_workspace', {
        sourcePath,
        fileName: workspaceFileName,
        resizeImage: false
      });

      imported.push({ sourcePath, workspacePath });
    }

    return imported;
  }

  async importImagesToWorkspace(entries: Array<{ itemId: number; sourcePath: string }>): Promise<Array<{ itemId: number; workspacePath: string }>> {
    const imported: Array<{ itemId: number; workspacePath: string }> = [];

    for (const entry of entries) {
      if (!entry.sourcePath) {
        continue;
      }

      const workspacePath = await this.copyImageToWorkspace(entry.itemId, entry.sourcePath);
      imported.push({ itemId: entry.itemId, workspacePath });
    }

    return imported;
  }

  async copyImageToWorkspace(itemId: number, sourcePath: string): Promise<string> {
    const item = this.playlistService.items().find(candidate => candidate.id === itemId);
    const workspaceRoot = this.playlistService.workspacePath();

    if (!item || !workspaceRoot) {
      throw new Error('Image workspace path is not available');
    }

    const fileName = this.normalizeImageFileName(
      item.imagepath ? await basename(item.imagepath) : `${item.uuid}.jpg`
    );

    return invoke<string>('copy_file_to_workspace', {
      sourcePath,
      fileName,
      resizeImage: true
    });
  }

  isSupportedImagePath(path: string): boolean {
    return FileService.SUPPORTED_IMAGE_EXTENSIONS.includes(this.getFileExtension(path));
  }

  dispose(): void {
    void this.progressUnlisten?.then(unlisten => unlisten());
  }

  getOperationProgress(formatBytes: (value: number) => string): OperationProgress {
    const progress = this.progress();
    const detail = this.getProgressDetail();

    if (!progress) {
      return {
        label: this.progressLabel(),
        detail,
        percent: null,
        currentFile: null,
        filesText: null,
        bytesText: null,
        indeterminate: true
      };
    }

    const hasKnownBytes = progress.total_bytes > 0;
    const percent = hasKnownBytes
      ? Math.min(100, (progress.done_bytes / progress.total_bytes) * 100)
      : null;

    return {
      label: this.progressLabel(),
      detail,
      percent,
      currentFile: progress.current_rel_path,
      filesText: progress.total_files > 0
        ? `${progress.done_files} / ${progress.total_files} fichiers`
        : null,
      bytesText: hasKnownBytes
        ? `${formatBytes(progress.done_bytes)} / ${formatBytes(progress.total_bytes)}`
        : null,
      indeterminate: !hasKnownBytes
    };
  }

  private async loadWorkspacePlaylist(result: WorkspaceTransferResult): Promise<void> {
    const readResult = await invoke<{ data: number[]; base_path: string }>('read_playlist_file', {
      path: result.playlist_path
    });

    const buffer = new Uint8Array(readResult.data).buffer;
    this.playlistService.loadPlaylist(buffer, result.playlist_path, result.base_path, result.root);
  }

  private async ensureRequiredThumbnails(): Promise<boolean> {
    const missingItems = this.playlistService.getItemsMissingRequiredThumbnail();

    if (missingItems.length === 0) {
      return true;
    }

    await message(
      "L'export est impossible tant que chaque dossier et chaque mp3 n'a pas de vignette.",
      {
        title: 'Vignettes manquantes',
        kind: 'warning',
        okLabel: 'Compris'
      }
    );

    return false;
  }

  private async handleMissingImportedAssets(): Promise<void> {
    const missingAssets = await this.getMissingImportedAssets();

    if (missingAssets.length === 0) {
      return;
    }

    const shouldRemove = await confirm(this.buildMissingAssetsMessage(missingAssets), {
      title: 'Fichiers manquants',
      kind: 'warning',
      okLabel: 'Supprimer',
      cancelLabel: 'Conserver'
    });

    if (!shouldRemove) {
      return;
    }

    missingAssets
      .map(asset => asset.itemId)
      .forEach(itemId => this.playlistService.deleteItem(itemId));
  }

  private async getMissingImportedAssets(): Promise<MissingPlaylistAsset[]> {
    const items = this.playlistService.items();
    const assetPaths = items.flatMap(item => [item.imagepath, item.soundpath])
      .map(path => path.trim())
      .filter(path => path.length > 0);

    if (assetPaths.length === 0) {
      return [];
    }

    const missingPaths = await this.findMissingPaths(assetPaths);

    if (missingPaths.size === 0) {
      return [];
    }

    return items.reduce<MissingPlaylistAsset[]>((missingItems, item) => {
      const missingKinds: string[] = [];

      if (item.imagepath.trim() && missingPaths.has(item.imagepath)) {
        missingKinds.push('vignette');
      }

      if (item.soundpath.trim() && missingPaths.has(item.soundpath)) {
        missingKinds.push('mp3');
      }

      if (missingKinds.length > 0) {
        missingItems.push({
          itemId: item.id,
          title: item.title,
          missingKinds
        });
      }

      return missingItems;
    }, []);
  }

  private buildMissingAssetsMessage(missingAssets: MissingPlaylistAsset[]): string {
    const preview = missingAssets
      .slice(0, 8)
      .map(asset => `- ${asset.title} (${asset.missingKinds.join(', ')})`)
      .join('\n');
    const remaining = missingAssets.length - Math.min(missingAssets.length, 8);
    const remainingText = remaining > 0 ? `\n... et ${remaining} autre(s) entrée(s).` : '';

    return [
      'Certaines entrées référencent des fichiers absents dans le dossier importé.',
      '',
      preview,
      remainingText,
      '',
      'Voulez-vous supprimer ces entrées de la playlist ?'
    ].join('\n').trim();
  }

  private async findMissingPaths(paths: string[]): Promise<Set<string>> {
    const uniquePaths = Array.from(new Set(paths));
    const missingPaths = await invoke<string[]>('find_missing_paths', { paths: uniquePaths });
    return new Set(missingPaths);
  }

  private async getWorkspaceStatus(): Promise<WorkspaceStatus> {
    return invoke<WorkspaceStatus>('get_workspace_status');
  }

  private normalizeImageFileName(fileName: string): string {
    return fileName.replace(/\.(jpeg|png|bmp|webp)$/i, '.jpg');
  }

  private getFileExtension(path: string): string {
    const extension = path.split('.').pop();
    return extension ? extension.toLowerCase() : '';
  }

  private async flushWorkspacePlaylistWrites(): Promise<void> {
    if (this.isPersistingWorkspacePlaylist) {
      return;
    }

    this.isPersistingWorkspacePlaylist = true;

    try {
      while (this.pendingWorkspacePlaylistWrite) {
        const pendingWrite = this.pendingWorkspacePlaylistWrite;
        this.pendingWorkspacePlaylistWrite = null;

        try {
          await invoke<string>('write_workspace_playlist', {
            data: pendingWrite.data
          });
          this.lastPersistedWorkspacePlaylistSignature = pendingWrite.signature;
        } catch (error) {
          console.error('Error persisting workspace playlist:', error);
        }
      }
    } finally {
      this.isPersistingWorkspacePlaylist = false;
    }
  }

  private beginProgress(label: string, detail = ''): void {
    this.progressEventCount = 0;
    console.info(FileService.LOG_PREFIX, 'begin', { label, detail });
    this.progressLabel.set(label);
    this.operationDetail.set(detail);
    this.progress.set({
      phase: 'scan',
      total_files: 0,
      done_files: 0,
      total_bytes: 0,
      done_bytes: 0,
      current_rel_path: null
    });
    this.operationInProgress.set(true);
    console.info(FileService.LOG_PREFIX, 'operationInProgress=true');
  }

  private endProgress(): void {
    console.info(FileService.LOG_PREFIX, 'end', {
      events: this.progressEventCount,
      lastProgress: this.progress()
    });
    this.operationInProgress.set(false);
    this.progress.set(null);
    this.progressLabel.set('');
    this.operationDetail.set('');
  }

  private getProgressDetail(): string {
    const progress = this.progress();

    if (!progress) {
      return this.operationDetail();
    }

    if (progress.phase === 'scan') {
      return progress.total_files > 0
        ? 'Copie des fichiers vers l\'application...'
        : 'Analyse du dossier source...';
    }

    if (progress.phase === 'copy') {
      return 'Copie des fichiers vers l\'application...';
    }

    if (progress.phase === 'export') {
      return 'Copie des fichiers vers le dossier de destination...';
    }

    return this.operationDetail();
  }

  private async flushUi(): Promise<void> {
    console.info(FileService.LOG_PREFIX, 'waiting next animation frame');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    console.info(FileService.LOG_PREFIX, 'animation frame reached');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    console.info(FileService.LOG_PREFIX, 'macrotask yielded');
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return fallback;
  }
}
