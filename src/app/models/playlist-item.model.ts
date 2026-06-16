export interface PlaylistItem {
  id: number;
  parent_id: number;
  order: number;
  nb_children: number;
  fav_order: number;
  type: PlaylistItemType;
  limit_time: number;
  add_time: number;
  uuid: string;
  title: string;
  imagepath: string;
  soundpath: string;
  children?: PlaylistItem[];
  expanded?: boolean;
  selected?: boolean;
}

export enum PlaylistItemType {
  Root = 1,
  Folder = 2,
  Song = 4,
  Favorite = 10,
  SongWithImage = 36
}

export interface PlaylistState {
  items: PlaylistItem[];
  hierarchy: PlaylistItem | null;
  selectedItem: PlaylistItem | null;
  filePath: string | null;
  basePath: string | null;
  isDirty: boolean;
}

export interface DragDropData {
  item: PlaylistItem;
  sourceParentId: number;
}
