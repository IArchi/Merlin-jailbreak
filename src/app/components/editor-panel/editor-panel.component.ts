import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import { PlaylistService } from '../../services/playlist.service';
import { FileService } from '../../services/file.service';
import { AudioImportCandidate, PlaylistItem, PlaylistItemType } from '../../models/playlist-item.model';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';
import { ThumbnailEditorComponent } from '../thumbnail-editor/thumbnail-editor.component';

interface ResolvedAudioImportCandidate {
  sourcePath: string;
  title: string;
  imageSourcePath: string | null;
}

@Component({
  selector: 'app-editor-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, AudioPlayerComponent, ThumbnailEditorComponent],
  templateUrl: './editor-panel.component.html',
  styleUrl: './editor-panel.component.css'
})
export class EditorPanelComponent {
  protected playlistService = inject(PlaylistService);
  protected fileService = inject(FileService);

  editingTitle = signal(false);
  titleValue = '';
  editingChildId = signal<number | null>(null);
  childTitleValue = '';

  constructor() {
    effect(() => {
      const item = this.selectedItem;
      this.titleValue = item?.title ?? '';
      this.editingTitle.set(false);
      this.editingChildId.set(null);
      this.childTitleValue = '';
    }, { allowSignalWrites: true });
  }

  get selectedItem(): PlaylistItem | null {
    return this.resolveEditorItem(this.playlistService.selectedItem());
  }

  get selectedTreeItem(): PlaylistItem | null {
    return this.playlistService.selectedItem();
  }

  get isSong(): boolean {
    const item = this.selectedItem;
    return item?.type === PlaylistItemType.Song || item?.type === PlaylistItemType.SongWithImage;
  }

  get isFolder(): boolean {
    const item = this.selectedItem;
    return item?.type === PlaylistItemType.Folder || item?.type === PlaylistItemType.Favorite;
  }

  get isRoot(): boolean {
    return this.selectedItem?.type === PlaylistItemType.Root;
  }

  get isContainer(): boolean {
    const item = this.selectedItem;
    return item?.type === PlaylistItemType.Root || item?.type === PlaylistItemType.Folder || item?.type === PlaylistItemType.Favorite;
  }

  get itemTypeLabel(): string {
    const item = this.selectedItem;
    if (!item) return '';
    switch (item.type) {
      case PlaylistItemType.Root: return 'Racine';
      case PlaylistItemType.Folder: return 'Dossier';
      case PlaylistItemType.Song: return 'Piste audio';
      case PlaylistItemType.Favorite: return 'Favoris';
      case PlaylistItemType.SongWithImage: return 'Piste audio';
      default: return 'Élément';
    }
  }

  get folderChildren(): PlaylistItem[] {
    const item = this.selectedItem;
    if (!item || !this.isContainer) {
      return [];
    }

    return this.playlistService.getChildren(item.id);
  }

  get hasFolderChildren(): boolean {
    return this.folderChildren.length > 0;
  }

  get maxTitleBytes(): number {
    return this.playlistService.maxUserTitleBytes;
  }

  get currentTitleBytes(): number {
    return this.playlistService.getUtf8ByteLength(this.titleValue);
  }

  get currentChildTitleBytes(): number {
    return this.playlistService.getUtf8ByteLength(this.childTitleValue);
  }

  startEditingTitle(): void {
    if (this.isRoot) {
      return;
    }

    this.editingTitle.set(true);
    this.titleValue = this.playlistService.normalizeUserTitleInput(this.selectedItem?.title ?? '');
  }

  saveTitle(): void {
    if (this.isRoot) {
      this.editingTitle.set(false);
      this.titleValue = this.selectedItem?.title ?? '';
      return;
    }

    if (this.selectedItem && this.titleValue.trim()) {
      this.playlistService.updateItemTitle(this.selectedItem.id, this.titleValue.trim());
    }
    this.editingTitle.set(false);
  }

  cancelEditingTitle(): void {
    this.titleValue = this.selectedItem?.title ?? '';
    this.editingTitle.set(false);
  }

  onTitleInput(): void {
    this.titleValue = this.playlistService.normalizeUserTitleInput(this.titleValue);
  }

  onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.saveTitle();
    } else if (event.key === 'Escape') {
      this.cancelEditingTitle();
    }
  }

  async onDelete(): Promise<void> {
    const item = this.selectedItem;

    if (!item || item.type === PlaylistItemType.Root) {
      return;
    }

    const shouldDelete = await confirm(`Êtes-vous sûr de vouloir supprimer "${item.title}" ?`, {
      title: 'Confirmer la suppression',
      kind: 'warning',
      okLabel: 'Supprimer',
      cancelLabel: 'Annuler'
    });

    if (shouldDelete) {
      this.playlistService.deleteItem(item.id);
    }
  }

  async onImportAudio(): Promise<void> {
    const parent = this.selectedItem;
    if (!parent || !this.isContainer) {
      return;
    }

    const shouldSelectDirectory = await confirm(
      'Voulez-vous importer un dossier plutôt que des fichiers MP3 ?\n\nLe dossier peut contenir des MP3 à la racine, ou des sous-dossiers contenant un MP3 et une image.',
      {
        title: 'Importer des MP3',
        kind: 'info',
        okLabel: 'Choisir un dossier',
        cancelLabel: 'Choisir des fichiers'
      }
    );

    const candidates = shouldSelectDirectory
      ? await this.selectAudioImportCandidatesFromDirectory()
      : await this.selectAudioImportCandidatesFromFiles();

    if (candidates.length === 0) {
      return;
    }

    const createdSongs = this.playlistService.createSongs(
      parent.id,
      candidates.map(candidate => ({ sourcePath: candidate.sourcePath, title: candidate.title }))
    );

    try {
      const importedFiles = await this.fileService.importAudioToWorkspace(
        candidates.map(candidate => candidate.sourcePath),
        createdSongs.map(song => song.soundpath)
      );
      const sourceToWorkspace = new Map(importedFiles.map(file => [file.sourcePath, file.workspacePath]));
      const imageImports = await this.fileService.importImagesToWorkspace(
        createdSongs.flatMap((song, index) => {
          const imageSourcePath = candidates[index]?.imageSourcePath;
          return imageSourcePath ? [{ itemId: song.id, sourcePath: imageSourcePath }] : [];
        })
      );
      const songIdToImagePath = new Map(imageImports.map(file => [file.itemId, file.workspacePath]));

      createdSongs.forEach((song, index) => {
        const sourcePath = candidates[index]?.sourcePath;
        const workspacePath = sourceToWorkspace.get(sourcePath);
        const imageWorkspacePath = songIdToImagePath.get(song.id);

        if (!workspacePath && !imageWorkspacePath) {
          return;
        }

        const assetUpdates: { soundpath?: string; imagepath?: string } = {};

        if (workspacePath) {
          assetUpdates.soundpath = workspacePath;
        }

        if (imageWorkspacePath) {
          assetUpdates.imagepath = imageWorkspacePath;
        }

        this.playlistService.updateItemAssetPaths(song.id, assetUpdates);
      });
    } catch (error) {
      console.error('Error importing audio into workspace:', error);
      await message(this.getImportDirectoryErrorMessage(error), {
        title: 'Erreur d’import',
        kind: 'error'
      });
    }
  }

  private async selectAudioImportCandidatesFromFiles(): Promise<ResolvedAudioImportCandidate[]> {
    const filePaths = await this.fileService.selectAudioFiles();
    return filePaths.map(filePath => ({
      sourcePath: filePath,
      title: filePath.split(/[/\\]/).pop()?.replace(/\.mp3$/i, '') || 'Piste audio',
      imageSourcePath: null
    }));
  }

  private async selectAudioImportCandidatesFromDirectory(): Promise<ResolvedAudioImportCandidate[]> {
    const directoryPath = await this.fileService.selectAudioImportDirectory();
    if (!directoryPath) {
      return [];
    }

    try {
      const scanned = await this.fileService.scanAudioImportDirectory(directoryPath);
      const candidates: ResolvedAudioImportCandidate[] = scanned.map((candidate: AudioImportCandidate) => ({
        sourcePath: candidate.source_path,
        title: candidate.title,
        imageSourcePath: candidate.image_source_path
      }));

      if (candidates.length === 0) {
        await message(
          'Aucun MP3 importable n’a été trouvé dans ce dossier.\n\nFormats pris en charge :\n- MP3 à la racine du dossier\n- Sous-dossiers contenant un MP3 et une image',
          {
            title: 'Import impossible',
            kind: 'warning'
          }
        );
      }

      return candidates;
    } catch (error) {
      await message(
        this.getImportDirectoryErrorMessage(error),
        {
          title: 'Erreur d’import',
          kind: 'error'
        }
      );
      return [];
    }
  }

  private getImportDirectoryErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    return 'Le scan du dossier a échoué.';
  }

  onCreateSubfolder(): void {
    const parent = this.selectedItem;
    if (!parent || !this.isContainer) {
      return;
    }

    this.playlistService.createFolder(parent.id, 'NouveauDossier');
  }

  onSelectChild(child: PlaylistItem): void {
    this.playlistService.selectItem(child);
  }

  async onDeleteChild(child: PlaylistItem): Promise<void> {
    const shouldDelete = await confirm(`Êtes-vous sûr de vouloir supprimer "${child.title}" ?`, {
      title: 'Confirmer la suppression',
      kind: 'warning',
      okLabel: 'Supprimer',
      cancelLabel: 'Annuler'
    });

    if (shouldDelete) {
      this.playlistService.deleteItem(child.id);
    }
  }

  onMoveChild(child: PlaylistItem, offset: number): void {
    const parent = this.selectedItem;
    if (!parent || !this.isContainer) {
      return;
    }

    const children = this.folderChildren;
    const currentIndex = children.findIndex(item => item.id === child.id);
    const newIndex = currentIndex + offset;

    if (currentIndex === -1 || newIndex < 0 || newIndex >= children.length) {
      return;
    }

    this.playlistService.moveItem(child.id, parent.id, newIndex);
  }

  startEditingChild(child: PlaylistItem): void {
    this.editingChildId.set(child.id);
    this.childTitleValue = this.playlistService.normalizeUserTitleInput(child.title);
  }

  onChildTitleInput(): void {
    this.childTitleValue = this.playlistService.normalizeUserTitleInput(this.childTitleValue);
  }

  getChildTypeLabel(child: PlaylistItem): string {
    if (child.type === PlaylistItemType.Folder || child.type === PlaylistItemType.Favorite) {
      return 'Dossier';
    }

    return 'MP3';
  }

  getChildBadgeClass(child: PlaylistItem): string {
    return this.isAudioChild(child) ? 'is-audio' : 'is-folder';
  }

  getChildSubtitle(child: PlaylistItem): string {
    if (child.type === PlaylistItemType.Folder || child.type === PlaylistItemType.Favorite) {
      return `${child.nb_children} élément(s)`;
    }

    if (!child.soundpath) {
      return 'Fichier audio à définir';
    }

    return child.soundpath.split(/[/\\]/).pop() || child.soundpath;
  }

  isChildSelected(child: PlaylistItem): boolean {
    return this.selectedTreeItem?.id === child.id;
  }

  isEditingChild(child: PlaylistItem): boolean {
    return this.editingChildId() === child.id;
  }

  saveChildTitle(child: PlaylistItem): void {
    const trimmedTitle = this.childTitleValue.trim();

    if (trimmedTitle) {
      this.playlistService.updateItemTitle(child.id, trimmedTitle);
    }

    this.editingChildId.set(null);
    this.childTitleValue = '';
  }

  cancelChildTitleEdit(): void {
    this.editingChildId.set(null);
    this.childTitleValue = '';
  }

  onChildTitleKeydown(event: KeyboardEvent, child: PlaylistItem): void {
    if (event.key === 'Enter') {
      this.saveChildTitle(child);
    } else if (event.key === 'Escape') {
      this.cancelChildTitleEdit();
    }
  }

  isAudioChild(child: PlaylistItem): boolean {
    return child.type === PlaylistItemType.Song || child.type === PlaylistItemType.SongWithImage;
  }

  private resolveEditorItem(item: PlaylistItem | null): PlaylistItem | null {
    if (!item || (item.type !== PlaylistItemType.Song && item.type !== PlaylistItemType.SongWithImage)) {
      return item;
    }

    return this.playlistService.items().find(candidate => candidate.id === item.parent_id) ?? null;
  }

}
