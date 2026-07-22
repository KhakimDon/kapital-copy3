export type FileNode = {
  id: number;
  parent_id: number | null;
  name: string;
  is_dir: boolean;
  size: number;
  mime: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  // optional extras depending on endpoint
  favorite?: boolean;
  shares?: number;       // count of public links (list view)
  path?: string;         // parent folder path (recent/favorites)
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type Crumb = { id: number; name: string };

export type ListResp = {
  parent_id: number | null;
  breadcrumb: Crumb[];
  items: FileNode[];
};

export type ItemsResp = { items: FileNode[] };

export type StatsResp = { used_bytes: number; files: number; trash_items: number };

export type ShareLink = {
  id: number;
  node_id: number;
  token: string;
  has_password: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type PublicView = FileNode & {
  breadcrumb: Crumb[];
  items?: FileNode[];
  dir_id?: number;
};

export type FilesView = "all" | "recent" | "favorites" | "trash";

export type SortKey = "name" | "size" | "updated_at";
export type SortDir = "asc" | "desc";
