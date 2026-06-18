import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { confirm } from '@tauri-apps/plugin-dialog';
import { FileService } from '../../services/file.service';
import { PlaylistService } from '../../services/playlist.service';
import { PlaylistItemType } from '../../models/playlist-item.model';

@Component({
  selector: 'app-thumbnail-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './thumbnail-editor.component.html',
  styleUrl: './thumbnail-editor.component.css'
})
export class ThumbnailEditorComponent {
  @Input() imagePath = '';
  @Input() itemId: number = 0;
  @Input() compact = false;
  @Input() hideEditAction = false;
  @Input() alt = 'Thumbnail';
  @Output() imageChanged = new EventEmitter<string>();

  protected fileService = inject(FileService);
  protected playlistService = inject(PlaylistService);

  isLoading = signal(false);
  isDragOver = signal(false);
  displayUrl = signal<string | null>(null);
  private objectUrl: string | null = null;

  get previewUrl(): string | null {
    return this.displayUrl();
  }

  get isAudio(): boolean {
    const item = this.playlistService.items().find(candidate => candidate.id === this.itemId);
    return item?.type === PlaylistItemType.Song || item?.type === PlaylistItemType.SongWithImage;
  }

  get isFolder(): boolean {
    const item = this.playlistService.items().find(candidate => candidate.id === this.itemId);
    return item?.type === PlaylistItemType.Folder || item?.type === PlaylistItemType.Favorite || item?.type === PlaylistItemType.Root;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['imagePath']) {
      return;
    }

    if (!this.imagePath) {
      this.clearPreview();
      return;
    }

    void this.loadPreview(this.imagePath);
  }

  ngOnDestroy(): void {
    this.clearPreview();
  }

  async onSelectImage(): Promise<void> {
    try {
      this.isLoading.set(true);
      const imagePath = await this.fileService.selectImage();
      if (imagePath) {
        const workspacePath = await this.fileService.copyImageToWorkspace(this.itemId, imagePath);
        this.playlistService.updateItemImage(this.itemId, workspacePath);
        this.imageChanged.emit(workspacePath);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRemoveImage(): Promise<void> {
    const shouldRemove = await confirm('Êtes-vous sûr de vouloir supprimer cette image ?', {
      title: 'Confirmer la suppression',
      kind: 'warning',
      okLabel: 'Supprimer',
      cancelLabel: 'Annuler'
    });

    if (shouldRemove) {
      this.playlistService.updateItemImage(this.itemId, '');
      this.imageChanged.emit('');
    }
  }

  async onPreviewClick(): Promise<void> {
    if (!this.compact) {
      return;
    }

    await this.onSelectImage();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    // In Tauri, we would need to handle file drops differently
    // For now, just open the file dialog
    await this.onSelectImage();
  }

  private async loadPreview(imagePath: string): Promise<void> {
    const url = await this.fileService.readAsset(imagePath);

    if (this.imagePath !== imagePath) {
      if (url) {
        URL.revokeObjectURL(url);
      }
      return;
    }

    this.setPreview(url);
  }

  private setPreview(url: string | null): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.objectUrl = url;
    this.displayUrl.set(url);
  }

  private clearPreview(): void {
    this.setPreview(null);
  }
}
