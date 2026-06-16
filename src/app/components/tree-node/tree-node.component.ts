import { Component, Input, Output, EventEmitter, inject, signal, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlaylistItem, PlaylistItemType } from '../../models/playlist-item.model';
import { PlaylistService } from '../../services/playlist.service';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-tree-node',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tree-node.component.html',
  styleUrl: './tree-node.component.css'
})
export class TreeNodeComponent implements OnDestroy, OnChanges {
  @Input() item!: PlaylistItem;
  @Input() level = 0;
  @Output() itemSelected = new EventEmitter<PlaylistItem>();
  @Output() createSubfolder = new EventEmitter<PlaylistItem>();

  protected playlistService = inject(PlaylistService);
  protected fileService = inject(FileService);

  isDragOver = false;
  dropPosition: 'before' | 'inside' | 'after' | null = null;
  thumbnailUrl = signal<string | null>(null);
  private thumbnailObjectUrl: string | null = null;

  ngOnDestroy(): void {
    this.clearThumbnail();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['item']) {
      return;
    }

    const imagePath = this.item?.imagepath;

    if (!imagePath || this.isRoot) {
      this.clearThumbnail();
      return;
    }

    void this.loadThumbnail(imagePath);
  }

  get isFolder(): boolean {
    return this.item.type === PlaylistItemType.Folder || 
           this.item.type === PlaylistItemType.Root ||
           this.item.type === PlaylistItemType.Favorite;
  }

  get isSong(): boolean {
    return this.item.type === PlaylistItemType.Song || 
           this.item.type === PlaylistItemType.SongWithImage;
  }

  get isRoot(): boolean {
    return this.item.type === PlaylistItemType.Root;
  }

  get hasChildren(): boolean {
    return this.item.children !== undefined && this.item.children.length > 0;
  }

  get isExpanded(): boolean {
    return this.item.expanded ?? false;
  }

  get isSelected(): boolean {
    return this.playlistService.selectedItem()?.id === this.item.id;
  }

  get thumbnailAlt(): string {
    return this.item.title || 'Vignette';
  }

  get hasMissingThumbnail(): boolean {
    return this.playlistService.isItemMissingRequiredThumbnail(this.item);
  }

  get itemBadgeLabel(): string | null {
    if (this.isRoot) {
      return null;
    }

    return this.isSong ? 'F' : 'D';
  }

  get itemBadgeClass(): string | null {
    if (this.isRoot) {
      return null;
    }

    return this.isSong ? 'is-audio' : 'is-folder';
  }

  onToggleExpand(event: MouseEvent): void {
    event.stopPropagation();
    this.playlistService.toggleExpand(this.item);
  }

  onSelect(): void {
    this.playlistService.selectItem(this.item);
    this.itemSelected.emit(this.item);
  }

  onCreateSubfolder(event: MouseEvent): void {
    event.stopPropagation();

    if (!this.isFolder || this.isRoot) {
      return;
    }

    this.createSubfolder.emit(this.item);
  }

  onDragStart(event: DragEvent): void {
    if (this.isRoot) {
      event.preventDefault();
      return;
    }
    
    event.dataTransfer?.setData('application/json', JSON.stringify({
      id: this.item.id,
      parentId: this.item.parent_id,
      order: this.item.order,
      type: this.item.type
    }));
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isRoot) {
      this.dropPosition = this.getRootDropPosition(event);
      this.isDragOver = true;
      return;
    }

    this.dropPosition = this.getNodeDropPosition(event);
    
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    this.dropPosition = null;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    this.isDragOver = false;
    const position = this.dropPosition;
    this.dropPosition = null;
    
    const data = event.dataTransfer?.getData('application/json');
    if (!data) return;
    
    try {
      const draggedItem = JSON.parse(data);
      
      // Prevent dropping on self
      if (draggedItem.id === this.item.id) return;
      
      // Prevent dropping parent into child
      if (this.isDescendantOf(draggedItem.id)) return;

      if (this.isRoot) {
        const newOrder = position === 'before' ? 0 : (this.item.children?.length ?? 0);
        this.playlistService.moveItem(draggedItem.id, this.item.id, newOrder);
        return;
      }
       
      let newParentId: number;
      let newOrder: number;
      
      if (position === 'inside' && this.isFolder) {
        // Drop inside folder
        newParentId = this.item.id;
        newOrder = this.item.children?.length ?? 0;
      } else if (position === 'before') {
        // Drop before this item
        newParentId = this.item.parent_id;
        newOrder = this.item.order;
        if (draggedItem.parentId === this.item.parent_id && draggedItem.order < this.item.order) {
          newOrder -= 1;
        }
      } else {
        // Drop after this item
        newParentId = this.item.parent_id;
        newOrder = this.item.order + 1;
        if (draggedItem.parentId === this.item.parent_id && draggedItem.order < this.item.order) {
          newOrder -= 1;
        }
      }
      
      this.playlistService.moveItem(draggedItem.id, newParentId, newOrder);
    } catch (e) {
      console.error('Error parsing drag data:', e);
    }
  }

  private isDescendantOf(ancestorId: number): boolean {
    const checkDescendant = (item: PlaylistItem): boolean => {
      if (item.id === ancestorId) return true;
      if (item.children) {
        return item.children.some(child => checkDescendant(child));
      }
      return false;
    };

    return this.item.children?.some(child => checkDescendant(child)) ?? false;
  }

  private getRootDropPosition(event: DragEvent): 'before' | 'inside' {
    const { y, height } = this.getDropMetrics(event);
    return y < height * 0.5 ? 'before' : 'inside';
  }

  private getNodeDropPosition(event: DragEvent): 'before' | 'inside' | 'after' {
    const { y, height } = this.getDropMetrics(event);

    if (!this.isFolder) {
      return y < height * 0.5 ? 'before' : 'after';
    }

    if (y < height * 0.4) {
      return 'before';
    }

    if (y > height * 0.6) {
      return 'after';
    }

    return 'inside';
  }

  private getDropMetrics(event: DragEvent): { y: number; height: number } {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      y: event.clientY - rect.top,
      height: rect.height
    };
  }

  private async loadThumbnail(imagePath: string): Promise<void> {
    const url = await this.fileService.readAsset(imagePath);

    if (this.item.imagepath !== imagePath) {
      if (url) {
        URL.revokeObjectURL(url);
      }
      return;
    }

    this.setThumbnail(url);
  }

  private setThumbnail(url: string | null): void {
    if (this.thumbnailObjectUrl) {
      URL.revokeObjectURL(this.thumbnailObjectUrl);
      this.thumbnailObjectUrl = null;
    }

    this.thumbnailObjectUrl = url;
    this.thumbnailUrl.set(url);
  }

  private clearThumbnail(): void {
    this.setThumbnail(null);
  }
}
