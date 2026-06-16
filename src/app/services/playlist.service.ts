import { Injectable, signal, computed } from '@angular/core';
import { PlaylistItem, PlaylistItemType, PlaylistState } from '../models/playlist-item.model';

@Injectable({
  providedIn: 'root'
})
export class PlaylistService {
  private state = signal<PlaylistState>({
    items: [],
    hierarchy: null,
    selectedItem: null,
    filePath: null,
    basePath: null,
    isDirty: false
  });

  readonly items = computed(() => this.state().items);
  readonly hierarchy = computed(() => this.state().hierarchy);
  readonly selectedItem = computed(() => this.state().selectedItem);
  readonly filePath = computed(() => this.state().filePath);
  readonly basePath = computed(() => this.state().basePath);
  readonly isDirty = computed(() => this.state().isDirty);
  readonly foldersCount = computed(() =>
    this.state().items.filter(item => item.type === PlaylistItemType.Folder || item.type === PlaylistItemType.Favorite).length
  );
  readonly songsCount = computed(() =>
    this.state().items.filter(item => item.type === PlaylistItemType.Song || item.type === PlaylistItemType.SongWithImage).length
  );
  readonly visibleItemsCount = computed(() =>
    this.state().items.filter(item => item.type !== PlaylistItemType.Root).length
  );

  private readonly ITEM_SIZE = 156; // Total bytes per item in binary format

  private createRootItem(): PlaylistItem {
    return {
      id: 1,
      parent_id: 0,
      order: 0,
      nb_children: 0,
      fav_order: 0,
      type: PlaylistItemType.Root,
      limit_time: 0,
      add_time: Math.floor(Date.now() / 1000),
      uuid: 'root',
      title: 'Ma playlist',
      imagepath: '',
      soundpath: '',
      children: [],
      expanded: true,
      selected: false
    };
  }

  /**
   * Parse a binary playlist file
   */
  parsePlaylistBin(buffer: ArrayBuffer, basePath: string): PlaylistItem[] {
    const items: PlaylistItem[] = [];
    const view = new DataView(buffer);
    let offset = 0;

    while (offset < buffer.byteLength) {
      const item: PlaylistItem = {
        id: view.getUint16(offset, true),
        parent_id: view.getUint16(offset + 2, true),
        order: view.getUint16(offset + 4, true),
        nb_children: view.getUint16(offset + 6, true),
        fav_order: view.getUint16(offset + 8, true),
        type: view.getUint16(offset + 10, true),
        limit_time: view.getUint32(offset + 12, true),
        add_time: view.getUint32(offset + 16, true),
        uuid: '',
        title: '',
        imagepath: '',
        soundpath: '',
        children: [],
        expanded: view.getUint16(offset + 10, true) === PlaylistItemType.Root,
        selected: false
      };

      // Read UUID (1 byte length + 64 bytes data)
      const uuidLength = view.getUint8(offset + 20);
      const uuidBytes = new Uint8Array(buffer, offset + 21, uuidLength);
      item.uuid = new TextDecoder().decode(uuidBytes);

      // Read Title (1 byte length + 66 bytes data) - starts at offset + 85
      const titleLength = view.getUint8(offset + 85);
      const titleBytes = new Uint8Array(buffer, offset + 86, titleLength);
      item.title = new TextDecoder().decode(titleBytes);

      // Set image and sound paths based on type
      if (item.type !== PlaylistItemType.Root) {
        item.imagepath = `${basePath}/${item.uuid}.jpg`;
      }
      if (item.type === PlaylistItemType.Song || item.type === PlaylistItemType.SongWithImage) {
        item.soundpath = `${basePath}/${item.uuid}.mp3`;
      }

      items.push(item);
      offset += this.ITEM_SIZE;
    }

    return items;
  }

  /**
   * Build hierarchy from flat items list
   */
  buildHierarchy(items: PlaylistItem[]): PlaylistItem | null {
    const itemMap = new Map<number, PlaylistItem>();
    
    // Clone items and add to map
    items.forEach(item => {
      const clonedItem = { ...item, children: [] };
      itemMap.set(item.id, clonedItem);
    });

    let root: PlaylistItem | null = null;

    // Build hierarchy
    itemMap.forEach(item => {
      if (item.parent_id === 0) {
        root = item;
      } else {
        const parent = itemMap.get(item.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(item);
        }
      }
    });

    // Sort children by order
    const sortChildren = (item: PlaylistItem) => {
      if (item.children && item.children.length > 0) {
        item.children.sort((a, b) => a.order - b.order);
        item.children.forEach(sortChildren);
      }
    };

    if (root) {
      sortChildren(root);
    }

    return root;
  }

  /**
   * Export items to binary format
   */
  exportToBinary(items: PlaylistItem[]): ArrayBuffer {
    const buffer = new ArrayBuffer(items.length * this.ITEM_SIZE);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    items.forEach((item, index) => {
      const offset = index * this.ITEM_SIZE;

      view.setUint16(offset, item.id, true);
      view.setUint16(offset + 2, item.parent_id, true);
      view.setUint16(offset + 4, item.order, true);
      view.setUint16(offset + 6, item.nb_children, true);
      view.setUint16(offset + 8, item.fav_order, true);
      view.setUint16(offset + 10, item.type, true);
      view.setUint32(offset + 12, item.limit_time, true);
      view.setUint32(offset + 16, item.add_time, true);

      // Write UUID
      const uuidBytes = new TextEncoder().encode(item.uuid);
      view.setUint8(offset + 20, uuidBytes.length);
      uint8.set(uuidBytes.slice(0, 64), offset + 21);

      // Write Title
      const titleBytes = new TextEncoder().encode(item.title);
      view.setUint8(offset + 85, titleBytes.length);
      uint8.set(titleBytes.slice(0, 66), offset + 86);
    });

    return buffer;
  }

  /**
   * Load playlist from file
   */
  loadPlaylist(buffer: ArrayBuffer, filePath: string, basePath: string): void {
    const items = this.parsePlaylistBin(buffer, basePath);
    const hierarchy = this.buildHierarchy(items);

    this.state.set({
      items,
      hierarchy,
      selectedItem: null,
      filePath,
      basePath,
      isDirty: false
    });
  }

  /**
   * Create an empty playlist with a root node so editing can start immediately.
   */
  createEmptyPlaylist(): void {
    const root = this.createRootItem();

    this.state.set({
      items: [root],
      hierarchy: root,
      selectedItem: root,
      filePath: null,
      basePath: null,
      isDirty: true
    });
  }

  /**
   * Select an item
   */
  selectItem(item: PlaylistItem | null): void {
    this.state.update(s => {
      if (!item) {
        return {
          ...s,
          selectedItem: null
        };
      }

      const items = this.expandAncestors(s.items, item.id);
      const hierarchy = this.buildHierarchy(items);

      return {
        ...s,
        items,
        hierarchy,
        selectedItem: hierarchy ? this.findInHierarchy(hierarchy, item.id) : item
      };
    });
  }

  /**
   * Toggle item expansion
   */
  toggleExpand(item: PlaylistItem): void {
    this.state.update(s => {
      const items = s.items.map(existingItem => {
        if (existingItem.id !== item.id) {
          return existingItem;
        }

        return {
          ...existingItem,
          expanded: !(existingItem.expanded ?? false)
        };
      });

      const hierarchy = this.buildHierarchy(items);

      return {
        ...s,
        items,
        hierarchy,
        selectedItem: this.resolveSelectedItem(hierarchy, s.selectedItem)
      };
    });
  }

  /**
   * Update item title
   */
  updateItemTitle(itemId: number, newTitle: string): void {
    this.state.update(s => {
      const itemToUpdate = s.items.find(item => item.id === itemId);

      if (!itemToUpdate || itemToUpdate.type === PlaylistItemType.Root) {
        return s;
      }

      return {
        ...s,
        items: s.items.map(item => 
          item.id === itemId ? { ...item, title: newTitle } : item
        ),
        hierarchy: s.hierarchy ? this.updateInHierarchy(s.hierarchy, itemId, { title: newTitle }) : null,
        selectedItem: s.selectedItem?.id === itemId ? { ...s.selectedItem, title: newTitle } : s.selectedItem,
        isDirty: true
      };
    });
  }

  /**
   * Update item image path
   */
  updateItemImage(itemId: number, imagePath: string): void {
    this.state.update(s => {
      const itemToUpdate = s.items.find(item => item.id === itemId);
      if (!itemToUpdate) {
        return s;
      }

      const updates: Partial<PlaylistItem> = {
        imagepath: imagePath,
        type: this.getTypeForImage(itemToUpdate.type, imagePath)
      };

      return {
        ...s,
        items: s.items.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        ),
        hierarchy: s.hierarchy ? this.updateInHierarchy(s.hierarchy, itemId, updates) : null,
        selectedItem: s.selectedItem?.id === itemId ? { ...s.selectedItem, ...updates } : s.selectedItem,
        isDirty: true
      };
    });
  }

  /**
   * Move item to new parent
   */
  moveItem(itemId: number, newParentId: number, newOrder: number): void {
    this.state.update(s => {
      const item = s.items.find(i => i.id === itemId);
      if (!item) return s;

      const oldParentId = item.parent_id;
      const movingAcrossParents = oldParentId !== newParentId;
      const oldSiblings = s.items
        .filter(i => i.parent_id === oldParentId && i.id !== itemId)
        .sort((a, b) => a.order - b.order);
      const targetSiblings = (movingAcrossParents ? s.items : oldSiblings)
        .filter(i => i.parent_id === newParentId)
        .sort((a, b) => a.order - b.order);
      const insertAt = Math.max(0, Math.min(newOrder, targetSiblings.length));
      const reorderedTargetSiblings = [...targetSiblings];

      reorderedTargetSiblings.splice(insertAt, 0, {
        ...item,
        parent_id: newParentId
      });

      const orderUpdates = new Map<number, Pick<PlaylistItem, 'parent_id' | 'order'>>();
      oldSiblings.forEach((sibling, index) => {
        orderUpdates.set(sibling.id, { parent_id: oldParentId, order: index });
      });
      reorderedTargetSiblings.forEach((sibling, index) => {
        orderUpdates.set(sibling.id, { parent_id: newParentId, order: index });
      });

      let items = s.items.map(existingItem => {
        const update = orderUpdates.get(existingItem.id);
        if (!update) {
          return existingItem;
        }

        return {
          ...existingItem,
          parent_id: update.parent_id,
          order: update.order
        };
      });

      if (movingAcrossParents) {
        items = items.map(existingItem => {
          if (existingItem.id === oldParentId && this.isContainerType(existingItem.type)) {
            return { ...existingItem, nb_children: Math.max(0, existingItem.nb_children - 1) };
          }

          if (existingItem.id === newParentId && this.isContainerType(existingItem.type)) {
            return { ...existingItem, nb_children: existingItem.nb_children + 1 };
          }

          return existingItem;
        });
      }

      const hierarchy = this.buildHierarchy(items);

      return {
        ...s,
        items,
        hierarchy,
        selectedItem: this.resolveSelectedItem(hierarchy, s.selectedItem),
        isDirty: true
      };
    });
  }

  /**
   * Create new folder
   */
  createFolder(parentId: number, title: string): void {
    this.state.update(s => {
      const maxId = Math.max(...s.items.map(i => i.id), 0);
      const siblings = s.items.filter(i => i.parent_id === parentId);
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(i => i.order)) + 1 : 0;

      const newFolder: PlaylistItem = {
        id: maxId + 1,
        parent_id: parentId,
        order: maxOrder,
        nb_children: 0,
        fav_order: 0,
        type: PlaylistItemType.Folder,
        limit_time: 0,
        add_time: Math.floor(Date.now() / 1000),
        uuid: crypto.randomUUID(),
        title,
        imagepath: '',
        soundpath: '',
        children: [],
        expanded: false,
        selected: false
      };

      // Update parent's children count
      const items = s.items.map(item => 
        item.id === parentId
          ? { ...item, nb_children: item.nb_children + 1, expanded: true }
          : item
      );
      items.push(newFolder);

      const hierarchy = this.buildHierarchy(items);
      const selectedItem = hierarchy ? this.findInHierarchy(hierarchy, newFolder.id) : newFolder;

      return {
        ...s,
        items,
        hierarchy,
        selectedItem,
        isDirty: true
      };
    });
  }

  createSongs(parentId: number, filePaths: string[]): void {
    if (filePaths.length === 0) {
      return;
    }

    this.state.update(s => {
      const maxId = Math.max(...s.items.map(i => i.id), 0);
      const siblings = s.items.filter(i => i.parent_id === parentId);
      const nextOrder = siblings.length > 0 ? Math.max(...siblings.map(i => i.order)) + 1 : 0;
      const now = Math.floor(Date.now() / 1000);

      const newSongs = filePaths.map((filePath, index) => {
        const fileName = this.getFileName(filePath);
        const title = fileName.replace(/\.mp3$/i, '');

        return {
          id: maxId + index + 1,
          parent_id: parentId,
          order: nextOrder + index,
          nb_children: 0,
          fav_order: 0,
          type: PlaylistItemType.Song,
          limit_time: 0,
          add_time: now,
          uuid: crypto.randomUUID(),
          title,
          imagepath: '',
          soundpath: filePath,
          children: [],
          expanded: false,
          selected: false
        } satisfies PlaylistItem;
      });

      const items = s.items.map(item =>
        item.id === parentId && this.isContainerType(item.type)
          ? { ...item, nb_children: item.nb_children + newSongs.length }
          : item
      );

      items.push(...newSongs);
      const hierarchy = this.buildHierarchy(items);

      return {
        ...s,
        items,
        hierarchy,
        selectedItem: this.resolveSelectedItem(hierarchy, s.selectedItem),
        isDirty: true
      };
    });
  }

  /**
   * Delete item and its children
   */
  deleteItem(itemId: number): void {
    this.state.update(s => {
      const itemToDelete = s.items.find(i => i.id === itemId);
      if (!itemToDelete || itemToDelete.type === PlaylistItemType.Root) return s;

      const fallbackSelectedItem = s.items.find(item => item.id === itemToDelete.parent_id) ?? null;

      // Get all descendant IDs
      const getDescendantIds = (parentId: number): number[] => {
        const children = s.items.filter(i => i.parent_id === parentId);
        return children.flatMap(child => [child.id, ...getDescendantIds(child.id)]);
      };

      const idsToDelete = new Set([itemId, ...getDescendantIds(itemId)]);
      
      // Update parent's children count
      let items = s.items.map(item => 
        item.id === itemToDelete.parent_id 
          ? { ...item, nb_children: item.nb_children - 1 } 
          : item
      );

      // Remove items
      items = items.filter(item => !idsToDelete.has(item.id));

      // Reorder siblings
      items.filter(i => i.parent_id === itemToDelete.parent_id)
        .sort((a, b) => a.order - b.order)
        .forEach((sibling, index) => {
          const sibIndex = items.findIndex(i => i.id === sibling.id);
          items[sibIndex] = { ...sibling, order: index };
        });

      const hierarchy = this.buildHierarchy(items);

      return {
        ...s,
        items,
        hierarchy,
        selectedItem: s.selectedItem && idsToDelete.has(s.selectedItem.id)
          ? this.resolveSelectedItem(hierarchy, fallbackSelectedItem)
          : this.resolveSelectedItem(hierarchy, s.selectedItem),
        isDirty: true
      };
    });
  }

  /**
   * Get flattened items list for export
   */
  getFlattenedItems(): PlaylistItem[] {
    return this.state().items.map(item => ({
      ...item,
      children: undefined,
      expanded: undefined,
      selected: undefined
    }));
  }

  getChildren(parentId: number): PlaylistItem[] {
    return this.state().items
      .filter(item => item.parent_id === parentId)
      .sort((a, b) => a.order - b.order);
  }

  itemRequiresThumbnail(item: PlaylistItem): boolean {
    return item.type === PlaylistItemType.Folder ||
      item.type === PlaylistItemType.Favorite ||
      item.type === PlaylistItemType.Song ||
      item.type === PlaylistItemType.SongWithImage;
  }

  isItemMissingRequiredThumbnail(item: PlaylistItem): boolean {
    return this.itemRequiresThumbnail(item) && !item.imagepath.trim();
  }

  getItemsMissingRequiredThumbnail(): PlaylistItem[] {
    return this.state().items.filter(item => this.isItemMissingRequiredThumbnail(item));
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state.set({
      items: [],
      hierarchy: null,
      selectedItem: null,
      filePath: null,
      basePath: null,
      isDirty: false
    });
  }

  /**
   * Mark as saved
   */
  markAsSaved(): void {
    this.state.update(s => ({ ...s, isDirty: false }));
  }

  private resolveSelectedItem(hierarchy: PlaylistItem | null, selectedItem: PlaylistItem | null): PlaylistItem | null {
    if (!hierarchy || !selectedItem) {
      return null;
    }

    return this.findInHierarchy(hierarchy, selectedItem.id);
  }

  private isContainerType(type: PlaylistItemType): boolean {
    return type === PlaylistItemType.Root || type === PlaylistItemType.Folder || type === PlaylistItemType.Favorite;
  }

  private getTypeForImage(type: PlaylistItemType, imagePath: string): PlaylistItemType {
    if (type === PlaylistItemType.Song || type === PlaylistItemType.SongWithImage) {
      return imagePath.trim() ? PlaylistItemType.SongWithImage : PlaylistItemType.Song;
    }

    return type;
  }

  private getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  private expandAncestors(items: PlaylistItem[], itemId: number): PlaylistItem[] {
    const itemMap = new Map(items.map(item => [item.id, item]));
    const expandedIds = new Set<number>();
    let currentItem = itemMap.get(itemId) ?? null;

    while (currentItem && currentItem.parent_id !== 0) {
      expandedIds.add(currentItem.parent_id);
      currentItem = itemMap.get(currentItem.parent_id) ?? null;
    }

    if (expandedIds.size === 0) {
      return items;
    }

    return items.map(item => (
      expandedIds.has(item.id) && this.isContainerType(item.type)
        ? { ...item, expanded: true }
        : item
    ));
  }

  private updateInHierarchy(node: PlaylistItem, itemId: number, updates: Partial<PlaylistItem>): PlaylistItem {
    if (node.id === itemId) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return {
        ...node,
        children: node.children.map(child => this.updateInHierarchy(child, itemId, updates))
      };
    }
    return node;
  }

  private findInHierarchy(node: PlaylistItem, itemId: number): PlaylistItem | null {
    if (node.id === itemId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findInHierarchy(child, itemId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}
