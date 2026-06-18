import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileService } from '../../services/file.service';
import { PlaylistService } from '../../services/playlist.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css'
})
export class WelcomeComponent {
  protected fileService = inject(FileService);
  protected playlistService = inject(PlaylistService);

  isDragOver = false;

  async onImport(): Promise<void> {
    await this.fileService.openPlaylistDirectory();
  }

  onCreatePlaylist(): void {
    this.playlistService.setWorkspacePath(this.playlistService.workspacePath());
    this.playlistService.createEmptyPlaylist();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    // Note: In Tauri, we would need to handle file drops differently
    // This is a placeholder for potential future implementation
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      await this.fileService.openPlaylistDirectory();
    }
  }
}
