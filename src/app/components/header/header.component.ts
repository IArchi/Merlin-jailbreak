import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { message } from '@tauri-apps/plugin-dialog';
import { PlaylistService } from '../../services/playlist.service';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  protected playlistService = inject(PlaylistService);
  protected fileService = inject(FileService);

  async onImport(): Promise<void> {
    await this.fileService.openPlaylistDirectory();
  }

  async onExport(): Promise<void> {
    await this.fileService.exportFile();
  }

  onCreatePlaylist(): void {
    this.playlistService.setWorkspacePath(this.playlistService.workspacePath());
    this.playlistService.createEmptyPlaylist();
  }

  onNewFolder(): void {
    const hierarchy = this.playlistService.hierarchy();

    if (!hierarchy) {
      return;
    }

    this.playlistService.createFolder(hierarchy.id, 'NouveauDossier');
  }

  async onDebugPlaylist(): Promise<void> {
    const debugText = this.playlistService.debugTreeText();
    console.info('[debug][playlist]\n' + debugText);

    await message(debugText, {
      title: 'Debug playlist.bin',
      kind: 'info'
    });
  }
}
