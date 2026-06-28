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
  workspacePath: string | null;
  isDirty: boolean;
}

export interface WorkspaceStatus {
  root: string;
  exists: boolean;
  non_empty: boolean;
  playlist_path: string | null;
  temp_exists: boolean;
  temp_non_empty: boolean;
  can_reopen: boolean;
}

export interface WorkspaceOpenResult {
  root: string;
  playlist_path: string;
  base_path: string;
}

export interface WorkspaceTransferResult {
  root: string;
  playlist_path: string;
  base_path: string;
  total_files: number;
  total_bytes: number;
}

export interface WorkspaceProgress {
  phase: string;
  total_files: number;
  done_files: number;
  total_bytes: number;
  done_bytes: number;
  current_rel_path: string | null;
}

export interface OperationProgress {
  label: string;
  detail: string;
  percent: number | null;
  currentFile: string | null;
  filesText: string | null;
  bytesText: string | null;
  indeterminate: boolean;
}

export interface DragDropData {
  item: PlaylistItem;
  sourceParentId: number;
}

export interface AudioImportCandidate {
  source_path: string;
  title: string;
  image_source_path: string | null;
}
