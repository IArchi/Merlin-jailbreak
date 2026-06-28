import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  protected readonly debugDialogOpen = signal(false);

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
    const debugText = this.playlistService.exportDebugTreeText();
    console.info('[debug][playlist]\n' + debugText);
    this.debugDialogOpen.set(true);
  }

  closeDebugDialog(): void {
    this.debugDialogOpen.set(false);
  }
}
