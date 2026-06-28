import { Injectable, signal, computed } from '@angular/core';
import { PlaylistItem, PlaylistItemType, PlaylistState } from '../models/playlist-item.model';

interface SongDraft {
  sourcePath: string;
  title?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlaylistService {
  private static readonly LOG_PREFIX = '[playlist]';
  private static readonly HEADER_SIZE = 20;
  private static readonly UUID_MAX_BYTES = 64;
  private static readonly TITLE_MAX_BYTES = 66;
  private static readonly USER_TITLE_MAX_BYTES = 64;
  private static readonly UUID_LENGTH_OFFSET = PlaylistService.HEADER_SIZE;
  private static readonly UUID_DATA_OFFSET = PlaylistService.UUID_LENGTH_OFFSET + 1;
  private static readonly TITLE_LENGTH_OFFSET = PlaylistService.UUID_DATA_OFFSET + PlaylistService.UUID_MAX_BYTES;
  private static readonly TITLE_DATA_OFFSET = PlaylistService.TITLE_LENGTH_OFFSET + 1;
  private state = signal<PlaylistState>({
    items: [],
    hierarchy: null,
    selectedItem: null,
    filePath: null,
    basePath: null,
    workspacePath: null,
    isDirty: false
  });

  readonly items = computed(() => this.state().items);
  readonly hierarchy = computed(() => this.state().hierarchy);
  readonly selectedItem = computed(() => this.state().selectedItem);
  readonly filePath = computed(() => this.state().filePath);
  readonly basePath = computed(() => this.state().basePath);
  readonly workspacePath = computed(() => this.state().workspacePath);
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
  readonly maxUserTitleBytes = PlaylistService.USER_TITLE_MAX_BYTES;
  readonly debugTreeText = computed(() => this.buildDebugReport(this.state().items, this.state().hierarchy));
  readonly exportDebugTreeText = computed(() => {
    const items = this.getFlattenedItems();
    const hierarchy = this.buildHierarchy(items);
    return this.buildDebugReport(items, hierarchy);
  });

  private readonly ITEM_SIZE = PlaylistService.TITLE_DATA_OFFSET + PlaylistService.TITLE_MAX_BYTES;

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

    this.log('parsePlaylistBin:start', {
      byteLength: buffer.byteLength,
      itemSize: this.ITEM_SIZE,
      basePath
    });

    while (offset + this.ITEM_SIZE <= buffer.byteLength) {
      const recordOffset = offset;
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
      const uuidLength = view.getUint8(offset + PlaylistService.UUID_LENGTH_OFFSET);
      if (uuidLength > PlaylistService.UUID_MAX_BYTES) {
        throw new RangeError(`Invalid UUID length ${uuidLength} at record offset ${offset}`);
      }
      const uuidBytes = new Uint8Array(buffer, offset + PlaylistService.UUID_DATA_OFFSET, uuidLength);
      item.uuid = new TextDecoder().decode(uuidBytes);

      // Read Title (1 byte length + 66 bytes data) - starts at offset + 85
      const titleLength = view.getUint8(offset + PlaylistService.TITLE_LENGTH_OFFSET);
      if (titleLength > PlaylistService.TITLE_MAX_BYTES) {
        throw new RangeError(`Invalid title length ${titleLength} at record offset ${offset}`);
      }
      const titleBytes = new Uint8Array(buffer, offset + PlaylistService.TITLE_DATA_OFFSET, titleLength);
      item.title = new TextDecoder().decode(titleBytes);

      // Set image and sound paths based on type
      if (item.type !== PlaylistItemType.Root) {
        item.imagepath = `${basePath}/${item.uuid}.jpg`;
      }
      if (item.type === PlaylistItemType.Song || item.type === PlaylistItemType.SongWithImage) {
        item.soundpath = `${basePath}/${item.uuid}.mp3`;
      }

      items.push(item);
      this.log('parsePlaylistBin:item', {
        recordOffset,
        id: item.id,
        parent_id: item.parent_id,
        order: item.order,
        nb_children: item.nb_children,
        type: item.type,
        uuid: item.uuid,
        title: item.title
      });
      offset += this.ITEM_SIZE;
    }

    if (offset !== buffer.byteLength) {
      const remainingBytes = buffer.byteLength - offset;
      throw new RangeError(
        `Invalid playlist.bin size: trailing ${remainingBytes} byte(s) after ${items.length} item(s)`
      );
    }

    this.log('parsePlaylistBin:complete', {
      itemCount: items.length,
      byteLength: buffer.byteLength
    });

    return items;
  }

  /**
   * Build hierarchy from flat items list
   */
  buildHierarchy(items: PlaylistItem[]): PlaylistItem | null {
    const itemMap = new Map<number, PlaylistItem>();
    const duplicateIds = new Set<number>();
    const missingParents: Array<{ id: number; parent_id: number }> = [];
    const rootCandidates: number[] = [];
    
    // Clone items and add to map
    items.forEach(item => {
      if (itemMap.has(item.id)) {
        duplicateIds.add(item.id);
      }

      const clonedItem = { ...item, children: [] };
      itemMap.set(item.id, clonedItem);
    });

    let root: PlaylistItem | null = null;

    // Build hierarchy
    for (const item of itemMap.values()) {
      if (item.parent_id === 0) {
        rootCandidates.push(item.id);
        root = item;
      } else {
        const parent = itemMap.get(item.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(item);
        } else {
          missingParents.push({ id: item.id, parent_id: item.parent_id });
        }
      }
    }

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

    const validationWarnings: string[] = [];

    if (duplicateIds.size > 0) {
      validationWarnings.push(`Duplicate ids: ${Array.from(duplicateIds).join(', ')}`);
    }

    if (rootCandidates.length > 1) {
      validationWarnings.push(`Multiple root candidates: ${rootCandidates.join(', ')}`);
    }

    if (missingParents.length > 0) {
      validationWarnings.push(
        ...missingParents.map(entry => `Missing parent ${entry.parent_id} for item ${entry.id}`)
      );
    }

    const childCountMismatches = items
      .filter(item => this.isContainerType(item.type))
      .map(item => ({ item, actualChildren: items.filter(candidate => candidate.parent_id === item.id).length }))
      .filter(({ item, actualChildren }) => item.nb_children !== actualChildren)
      .map(({ item, actualChildren }) => (
        `Child count mismatch for item ${item.id} (${item.title || this.getItemLabel(item)}): declared=${item.nb_children}, actual=${actualChildren}`
      ));

    validationWarnings.push(...childCountMismatches);

    this.log('buildHierarchy', {
      totalItems: items.length,
      rootId: root?.id ?? null,
      rootTitle: root ? this.getItemLabel(root) : null,
      warnings: validationWarnings
    });

    if (validationWarnings.length > 0) {
      validationWarnings.forEach(warning => this.warn('buildHierarchy', warning));
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
      const uuidLength = Math.min(uuidBytes.length, PlaylistService.UUID_MAX_BYTES);
      view.setUint8(offset + 20, uuidLength);
      uint8.set(uuidBytes.slice(0, uuidLength), offset + 21);

      // Write Title
      const exportTitle = this.trimToMaxBytes(item.title, PlaylistService.TITLE_MAX_BYTES);
      const titleBytes = new TextEncoder().encode(exportTitle);
      const titleLength = Math.min(titleBytes.length, PlaylistService.TITLE_MAX_BYTES);
      view.setUint8(offset + 85, titleLength);
      uint8.set(titleBytes.slice(0, titleLength), offset + 86);
    });

    return buffer;
  }

  /**
   * Load playlist from file
   */
  loadPlaylist(buffer: ArrayBuffer, filePath: string, basePath: string, workspacePath: string | null = null): void {
    this.log('loadPlaylist:start', {
      filePath,
      basePath,
      workspacePath,
      byteLength: buffer.byteLength
    });

    const items = this.parsePlaylistBin(buffer, basePath);
    const hierarchy = this.buildHierarchy(items);

    this.state.set({
      items,
      hierarchy,
      selectedItem: null,
      filePath,
      basePath,
      workspacePath,
      isDirty: false
    });

    this.log('loadPlaylist:complete', {
      itemCount: items.length,
      rootId: hierarchy?.id ?? null,
      selectedItemId: null
    });
    console.info(`${PlaylistService.LOG_PREFIX} loadPlaylist:tree\n${this.buildDebugReport(items, hierarchy)}`);
  }

  /**
   * Create an empty playlist with a root node so editing can start immediately.
   */
  createEmptyPlaylist(): void {
    const root = this.createRootItem();
    const workspacePath = this.state().workspacePath;

    this.state.set({
      items: [root],
      hierarchy: root,
      selectedItem: root,
      filePath: null,
      basePath: workspacePath,
      workspacePath,
      isDirty: true
    });

    this.log('createEmptyPlaylist', {
      workspacePath,
      rootId: root.id,
      title: root.title
    });
  }

  /**
   * Select an item
   */
  selectItem(item: PlaylistItem | null): void {
    this.log('selectItem:request', {
      requestedId: item?.id ?? null,
      requestedTitle: item?.title ?? null,
      requestedType: item?.type ?? null,
      previousSelectedId: this.state().selectedItem?.id ?? null
    });

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

    this.log('selectItem:applied', {
      selectedId: this.state().selectedItem?.id ?? null,
      selectedTitle: this.state().selectedItem?.title ?? null
    });
  }

  /**
   * Toggle item expansion
   */
  toggleExpand(item: PlaylistItem): void {
    this.log('toggleExpand:request', {
      itemId: item.id,
      title: item.title,
      currentExpanded: item.expanded ?? false
    });

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

    const updatedItem = this.state().items.find(existingItem => existingItem.id === item.id);
    this.log('toggleExpand:applied', {
      itemId: item.id,
      expanded: updatedItem?.expanded ?? false
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

      const sanitizedTitle = this.sanitizeTitle(newTitle);
      if (!sanitizedTitle) {
        return s;
      }

      const updates: Partial<PlaylistItem> = {
        title: sanitizedTitle
      };

      if (this.isNamedContainerType(itemToUpdate.type)) {
        updates.type = this.getContainerTypeForTitle(sanitizedTitle);
      }

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
    this.log('moveItem:request', { itemId, newParentId, newOrder });

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

    const movedItem = this.state().items.find(item => item.id === itemId);
    this.log('moveItem:applied', {
      itemId,
      parent_id: movedItem?.parent_id ?? null,
      order: movedItem?.order ?? null
    });
  }

  /**
   * Create new folder
   */
  createFolder(parentId: number, title: string): void {
    const sanitizedTitle = this.sanitizeTitle(title);
    if (!sanitizedTitle) {
      return;
    }

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
        type: this.getContainerTypeForTitle(sanitizedTitle),
        limit_time: 0,
        add_time: Math.floor(Date.now() / 1000),
        uuid: crypto.randomUUID(),
        title: sanitizedTitle,
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

    this.log('createFolder', { parentId, title: sanitizedTitle });
  }

  createSongs(parentId: number, entries: Array<string | SongDraft>): PlaylistItem[] {
    if (entries.length === 0) {
      return [];
    }

    this.log('createSongs:request', {
      parentId,
      count: entries.length,
      titles: entries.map(entry => typeof entry === 'string' ? this.getFileName(entry) : (entry.title ?? this.getFileName(entry.sourcePath)))
    });

    let createdSongs: PlaylistItem[] = [];

    this.state.update(s => {
      const maxId = Math.max(...s.items.map(i => i.id), 0);
      const siblings = s.items.filter(i => i.parent_id === parentId);
      const nextOrder = siblings.length > 0 ? Math.max(...siblings.map(i => i.order)) + 1 : 0;
      const now = Math.floor(Date.now() / 1000);
      const workspacePath = s.workspacePath;

      const newSongs = entries.map<PlaylistItem | null>((entry, index) => {
        const filePath = typeof entry === 'string' ? entry : entry.sourcePath;
        const rawTitle = typeof entry === 'string'
          ? this.getFileName(filePath).replace(/\.mp3$/i, '')
          : (entry.title?.trim() || this.getFileName(filePath).replace(/\.mp3$/i, ''));
        const title = this.sanitizeTitle(rawTitle);

        if (!title) {
          return null;
        }

        const uuid = crypto.randomUUID();

        return {
          id: maxId + index + 1,
          parent_id: parentId,
          order: nextOrder + index,
          nb_children: 0,
          fav_order: 0,
          type: PlaylistItemType.Song,
          limit_time: 0,
          add_time: now,
          uuid,
          title,
          imagepath: '',
          soundpath: this.buildWorkspaceAssetPath(workspacePath, uuid, 'mp3') || filePath,
          children: [],
          expanded: false,
          selected: false
        };
      }).filter((song): song is PlaylistItem => song !== null);

      createdSongs = newSongs;

      if (newSongs.length === 0) {
        return s;
      }

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

    return createdSongs;
  }

  /**
   * Delete item and its children
   */
  deleteItem(itemId: number): void {
    this.log('deleteItem:request', { itemId });

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

    this.log('deleteItem:applied', {
      itemId,
      stillExists: this.state().items.some(item => item.id === itemId),
      selectedId: this.state().selectedItem?.id ?? null
    });
  }

  /**
   * Get flattened items list for export
   */
  getFlattenedItems(): PlaylistItem[] {
    return this.prepareItemsForExport(this.state().items);
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
    const workspacePath = this.state().workspacePath;

    this.state.set({
      items: [],
      hierarchy: null,
      selectedItem: null,
      filePath: null,
      basePath: workspacePath,
      workspacePath,
      isDirty: false
    });
  }

  /**
   * Mark as saved
   */
  markAsSaved(): void {
    this.state.update(s => ({ ...s, isDirty: false }));
  }

  setWorkspacePath(workspacePath: string | null): void {
    this.state.update(s => ({
      ...s,
      workspacePath,
      basePath: workspacePath ?? s.basePath
    }));
  }

  updateItemAssetPaths(itemId: number, updates: { imagepath?: string; soundpath?: string }): void {
    this.state.update(s => {
      const itemToUpdate = s.items.find(item => item.id === itemId);
      if (!itemToUpdate) {
        return s;
      }

      const mergedUpdates: Partial<PlaylistItem> = {
        ...updates,
        type: updates.imagepath !== undefined
          ? this.getTypeForImage(itemToUpdate.type, updates.imagepath)
          : itemToUpdate.type
      };

      return {
        ...s,
        items: s.items.map(item => item.id === itemId ? { ...item, ...mergedUpdates } : item),
        hierarchy: s.hierarchy ? this.updateInHierarchy(s.hierarchy, itemId, mergedUpdates) : null,
        selectedItem: s.selectedItem?.id === itemId ? { ...s.selectedItem, ...mergedUpdates } : s.selectedItem,
        isDirty: true
      };
    });
  }

  getExportAssetPaths(): string[] {
    return this.state().items
      .flatMap(item => [item.imagepath, item.soundpath])
      .map(path => path.trim())
      .filter(path => path.length > 0);
  }

  normalizeUserTitleInput(value: string): string {
    return this.trimToMaxBytes(
      this.normalizeSupportedTitleCharacters(value),
      PlaylistService.USER_TITLE_MAX_BYTES
    );
  }

  getUtf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length;
  }

  private buildDebugReport(items: PlaylistItem[], hierarchy: PlaylistItem | null): string {
    if (!hierarchy) {
      return 'Aucune playlist chargee.';
    }

    const snapshot = this.state();
    const lines = [
      `file: ${snapshot.filePath ?? '(non charge)'}`,
      `base: ${snapshot.basePath ?? '(indefini)'}`,
      `workspace: ${snapshot.workspacePath ?? '(indefini)'}`,
      `items: ${items.length}`,
      `dirty: ${snapshot.isDirty}`,
      '',
      ...this.formatTreeLines(hierarchy)
    ];

    const warnings = this.collectDebugWarnings(items);

    if (warnings.length > 0) {
      lines.push('', 'Warnings:');
      warnings.forEach(warning => lines.push(`- ${warning}`));
    }

    return lines.join('\n');
  }

  private formatTreeLines(item: PlaylistItem, ancestorsHasNextSibling: boolean[] = []): string[] {
    const label = this.getItemLabel(item);
    const prefix = ancestorsHasNextSibling.length === 0
      ? ''
      : `${ancestorsHasNextSibling
        .slice(0, -1)
        .map(hasNextSibling => hasNextSibling ? '|   ' : '    ')
        .join('')}${ancestorsHasNextSibling.at(-1) ? '|-- ' : '\-- '}`;
    const lines = [
      `${prefix}${label} (`
      + `id: ${item.id}, `
      + `parent_id: ${item.parent_id}, `
      + `order: ${item.order}, `
      + `nb_children: ${item.nb_children}, `
      + `fav_order: ${item.fav_order}, `
      + `type: ${item.type}, `
      + `limit_time: ${item.limit_time}, `
      + `add_time: ${item.add_time}`
      + `)`
    ];

    const children = item.children ?? [];

    children.forEach((child, index) => {
      const hasNextSibling = index < children.length - 1;
      lines.push(...this.formatTreeLines(child, [...ancestorsHasNextSibling, hasNextSibling]));
    });

    return lines;
  }

  private collectDebugWarnings(items: PlaylistItem[]): string[] {
    const ids = new Set<number>();
    const duplicateIds = new Set<number>();
    const warnings: string[] = [];

    items.forEach(item => {
      if (ids.has(item.id)) {
        duplicateIds.add(item.id);
      }

      ids.add(item.id);

      if (item.parent_id !== 0 && !items.some(candidate => candidate.id === item.parent_id)) {
        warnings.push(`Missing parent ${item.parent_id} for item ${item.id}`);
      }
    });

    if (duplicateIds.size > 0) {
      warnings.push(`Duplicate ids: ${Array.from(duplicateIds).join(', ')}`);
    }

    items
      .filter(item => this.isContainerType(item.type))
      .forEach(item => {
        const actualChildren = items.filter(candidate => candidate.parent_id === item.id).length;

        if (actualChildren !== item.nb_children) {
          warnings.push(
            `Child count mismatch for item ${item.id} (${item.title || this.getItemLabel(item)}): declared=${item.nb_children}, actual=${actualChildren}`
          );
        }
      });

    return warnings;
  }

  private getItemLabel(item: PlaylistItem): string {
    if (item.type === PlaylistItemType.Root) {
      return 'Root';
    }

    return item.title.trim() || `(sans titre ${item.id})`;
  }

  private log(action: string, payload?: unknown): void {
    if (payload === undefined) {
      console.info(PlaylistService.LOG_PREFIX, action);
      return;
    }

    console.info(PlaylistService.LOG_PREFIX, action, payload);
  }

  private warn(action: string, message: string): void {
    console.warn(PlaylistService.LOG_PREFIX, action, message);
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

  private isNamedContainerType(type: PlaylistItemType): boolean {
    return type === PlaylistItemType.Folder || type === PlaylistItemType.Favorite;
  }

  private getContainerTypeForTitle(title: string): PlaylistItemType {
    return title === 'Merlin_favorite' ? PlaylistItemType.Favorite : PlaylistItemType.Folder;
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

  private buildWorkspaceAssetPath(workspacePath: string | null, uuid: string, extension: string): string {
    if (!workspacePath) {
      return '';
    }

    return `${workspacePath.replace(/[\\/]+$/, '')}/${uuid}.${extension}`;
  }

  private sanitizeTitle(title: string): string | null {
    const trimmedTitle = this.normalizeSupportedTitleCharacters(title).trim();

    if (!trimmedTitle) {
      return null;
    }

    return this.trimToMaxBytes(trimmedTitle, PlaylistService.USER_TITLE_MAX_BYTES);
  }

  private normalizeSupportedTitleCharacters(value: string): string {
    const normalized = value
      .normalize('NFKD')
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u0153/g, 'oe')
      .replace(/\u0152/g, 'OE')
      .replace(/\u00E6/g, 'ae')
      .replace(/\u00C6/g, 'AE')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u0300-\u036f]/g, '');

    return normalized.replace(/[^\x20-\x7E]/g, ' ');
  }

  private prepareItemsForExport(items: PlaylistItem[]): PlaylistItem[] {
    const exportItems = items.map(item => ({
      ...item,
      children: undefined,
      expanded: undefined,
      selected: undefined
    }));
    const originalById = new Map(exportItems.map(item => [item.id, item]));
    const childrenByParent = new Map<number, PlaylistItem[]>();

    exportItems.forEach(item => {
      const siblings = childrenByParent.get(item.parent_id) ?? [];
      siblings.push(item);
      childrenByParent.set(item.parent_id, siblings);
    });

    childrenByParent.forEach(children => {
      children.sort((left, right) => left.order - right.order || left.id - right.id);
      children.forEach((child, index) => {
        child.order = index;
      });
    });

    exportItems.forEach(item => {
      item.fav_order = 0;

      if (item.type === PlaylistItemType.Root) {
        item.parent_id = 0;
        item.order = 0;
        item.limit_time = 0;
        item.add_time = 0;
        item.uuid = '';
        item.title = 'Root';
        item.imagepath = '';
        item.soundpath = '';
      } else if (this.isNamedContainerType(item.type)) {
        item.type = this.getContainerTypeForTitle(item.title);
      }

      const childCount = childrenByParent.get(item.id)?.length ?? 0;
      item.nb_children = this.isContainerType(item.type) ? childCount : 0;
    });

    const orderedItems: PlaylistItem[] = [];
    const visitedIds = new Set<number>();

    const visit = (item: PlaylistItem): void => {
      if (visitedIds.has(item.id)) {
        return;
      }

      visitedIds.add(item.id);
      orderedItems.push(item);

      for (const child of childrenByParent.get(item.id) ?? []) {
        visit(child);
      }
    };

    for (const rootItem of childrenByParent.get(0) ?? []) {
      visit(rootItem);
    }

    for (const item of exportItems) {
      visit(item);
    }

    const remappedIds = new Map<number, number>();
    orderedItems.forEach((item, index) => {
      remappedIds.set(item.id, index + 1);
    });

    return orderedItems.map(item => {
      const originalItem = originalById.get(item.id);
      const remappedId = remappedIds.get(item.id) ?? item.id;
      const remappedParentId = item.parent_id === 0
        ? 0
        : (remappedIds.get(item.parent_id) ?? item.parent_id);
      const normalizedTitle = item.type === PlaylistItemType.Root
        ? 'Root'
        : this.trimToMaxBytes(
          this.normalizeSupportedTitleCharacters(originalItem?.title ?? item.title).trim(),
          PlaylistService.TITLE_MAX_BYTES
        );

      return {
        ...item,
        id: remappedId,
        parent_id: remappedParentId,
        title: normalizedTitle || item.title
      };
    });
  }

  private trimToMaxBytes(value: string, maxBytes: number): string {
    const encoder = new TextEncoder();

    if (encoder.encode(value).length <= maxBytes) {
      return value;
    }

    let trimmed = '';

    for (const char of value) {
      const nextValue = trimmed + char;

      if (encoder.encode(nextValue).length > maxBytes) {
        break;
      }

      trimmed = nextValue;
    }

    return trimmed.trim();
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
