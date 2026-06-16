import { Injectable, inject } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { message, open, save } from '@tauri-apps/plugin-dialog';
import { PlaylistService } from './playlist.service';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private playlistService = inject(PlaylistService);

  /**
   * Open a bin file using Tauri dialog
   */
  async openFile(): Promise<void> {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Playlist',
          extensions: ['bin']
        }]
      });

      if (selected && typeof selected === 'string') {
        const result = await invoke<{ data: number[]; base_path: string }>('read_playlist_file', {
          path: selected
        });

        const buffer = new Uint8Array(result.data).buffer;
        this.playlistService.loadPlaylist(buffer, selected, result.base_path);
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  }

  /**
   * Save playlist to bin file
   */
  async saveFile(): Promise<void> {
    try {
      if (!await this.ensureRequiredThumbnails()) {
        return;
      }

      const currentPath = this.playlistService.filePath();
      let savePath = currentPath;

      if (!savePath) {
        const selected = await save({
          filters: [{
            name: 'Playlist',
            extensions: ['bin']
          }],
          defaultPath: 'playlist.bin'
        });

        if (!selected) return;
        savePath = selected;
      }

      const items = this.playlistService.getFlattenedItems();
      const buffer = this.playlistService.exportToBinary(items);
      const data = Array.from(new Uint8Array(buffer));

      await invoke('write_playlist_file', {
        path: savePath,
        data
      });

      this.playlistService.markAsSaved();
    } catch (error) {
      console.error('Error saving file:', error);
    }
  }

  /**
   * Export to a new location
   */
  async exportFile(): Promise<void> {
    try {
      if (!await this.ensureRequiredThumbnails()) {
        return;
      }

      const selected = await save({
        filters: [{
          name: 'Playlist',
          extensions: ['bin']
        }],
        defaultPath: 'playlist.bin'
      });

      if (!selected) return;

      const items = this.playlistService.getFlattenedItems();
      const buffer = this.playlistService.exportToBinary(items);
      const data = Array.from(new Uint8Array(buffer));

      await invoke('write_playlist_file', {
        path: selected,
        data
      });
    } catch (error) {
      console.error('Error exporting file:', error);
    }
  }

  /**
   * Read an asset file (image or audio)
   */
  async readAsset(path: string): Promise<string | null> {
    try {
      const data = await invoke<number[]>('read_asset_file', { path });
      const uint8Array = new Uint8Array(data);
      
      // Determine mime type based on extension
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

  /**
   * Write an asset file
   */
  async writeAsset(path: string, data: Uint8Array): Promise<boolean> {
    try {
      await invoke('write_asset_file', {
        path,
        data: Array.from(data)
      });
      return true;
    } catch (error) {
      console.error('Error writing asset:', error);
      return false;
    }
  }

  /**
   * Select an image file using Tauri dialog
   */
  async selectImage(): Promise<string | null> {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'bmp']
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
}
