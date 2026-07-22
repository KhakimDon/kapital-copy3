// ─────────────────────────────────────────────────────────────────────────────
// Wiki — a Notion-style knowledge base. Local-first (zustand + persist, see
// store.ts) so it works without a backend; a later adapter can sync. Structure:
//   Space (per company, access-controlled) → nested Pages → ordered Blocks.
// ─────────────────────────────────────────────────────────────────────────────

export type BlockType =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "divider"
  | "code"
  | "image";

export type Block = {
  id: string;
  pageId: string;
  type: BlockType;
  text: string;
  checked?: boolean; // for `todo`
  /** Toggle nesting: a block whose parent is a `toggle` is hidden when collapsed. */
  parentBlockId?: string | null;
  collapsed?: boolean; // for `toggle`
  order: number;
};

export type Page = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon: string; // emoji
  cover?: string | null; // CSS gradient key (see COVER_GRADIENTS)
  fullWidth?: boolean; // Confluence-style wide layout (vs the default boxed 720px column)
  order: number;
  createdAt: string;
  updatedAt: string;
  lastEditedBy?: string | null;
};

/** Preset page-cover gradients (banner behind the title). */
export const COVER_GRADIENTS: { id: string; css: string }[] = [
  { id: "sunset", css: "linear-gradient(120deg, #f6d365 0%, #fda085 100%)" },
  { id: "peach", css: "linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)" },
  { id: "sky", css: "linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)" },
  { id: "ocean", css: "linear-gradient(120deg, #2193b0 0%, #6dd5ed 100%)" },
  { id: "grape", css: "linear-gradient(120deg, #a18cd1 0%, #fbc2eb 100%)" },
  { id: "forest", css: "linear-gradient(120deg, #5b86e5 0%, #36d1dc 100%)" },
  { id: "moss", css: "linear-gradient(120deg, #134e5e 0%, #71b280 100%)" },
  { id: "slate", css: "linear-gradient(120deg, #485563 0%, #29323c 100%)" },
  { id: "rose", css: "linear-gradient(120deg, #ff9a9e 0%, #fecfef 100%)" },
  { id: "cocoa", css: "linear-gradient(120deg, #c79081 0%, #dfa579 100%)" },
];
/** Curated page-cover photos — Uzbekistan architecture (originally from Pexels,
 *  now served from our OWN static bundle at `public/wiki-covers/` so covers never
 *  hotlink an external CDN). The stored cover value for a photo is its path;
 *  `coverCss` renders any image-like value (local path, http, or data URL) as a
 *  background image. Uploaded covers are stored as `data:` URLs → same path. */
export const COVER_PHOTO_IDS = [
  35301075, 19227961, 32493998, 19439173, 8693290, 35375781, 19473636, 19227934, 16386332,
];
export const COVER_IMAGES = COVER_PHOTO_IDS.map((id) => `/wiki-covers/${id}.jpg`);

// Anything that isn't a gradient id is an image: a local asset path (`/…`), an
// http(s) URL (legacy stored Pexels covers), or an uploaded `data:` URL.
export const isImageCover = (v?: string | null): boolean => !!v && /^(https?:|data:|\/)/.test(v);

export const coverCss = (v?: string | null): string | undefined => {
  if (!v) return undefined;
  if (isImageCover(v)) return `url("${v}") center / cover no-repeat`;
  return COVER_GRADIENTS.find((c) => c.id === v)?.css;
};


export type PageHistoryKind = "created" | "edited" | "renamed" | "moved";
export type PageHistory = {
  id: string;
  pageId: string;
  userId: string;
  at: string;
  kind: PageHistoryKind;
};

/** Per-page, per-user view record: last time + total opens (for stats + presence). */
export type PageViews = Record<string, Record<string, { at: string; count: number }>>;

export type AccessRole = "view" | "edit";

export type Space = {
  id: string;
  companyId: number | null;
  name: string;
  icon: string; // emoji
  order: number;
  ownerId: string;
  /** Per-member access. Owner is always an implicit editor. */
  access: Record<string, AccessRole>;
  /** Company-wide access ("everyone in the firm"), or null for members-only. */
  everyone: AccessRole | null;
  createdAt: string;
};

// ── block palette (slash menu + turn-into) ──────────────────────────────────
export const BLOCK_TYPES: {
  type: BlockType;
  labelKey: string;
  label: string;
  descKey: string;
  desc: string;
  icon: string; // lucide-react name
}[] = [
  { type: "text", labelKey: "modules.wiki.blocks.text", label: "Matn", descKey: "modules.wiki.blockDesc.text", desc: "Oddiy matn", icon: "Type" },
  { type: "h1", labelKey: "modules.wiki.blocks.h1", label: "Sarlavha 1", descKey: "modules.wiki.blockDesc.h1", desc: "Katta sarlavha", icon: "Heading1" },
  { type: "h2", labelKey: "modules.wiki.blocks.h2", label: "Sarlavha 2", descKey: "modules.wiki.blockDesc.h2", desc: "O'rta sarlavha", icon: "Heading2" },
  { type: "h3", labelKey: "modules.wiki.blocks.h3", label: "Sarlavha 3", descKey: "modules.wiki.blockDesc.h3", desc: "Kichik sarlavha", icon: "Heading3" },
  { type: "bulleted", labelKey: "modules.wiki.blocks.bulleted", label: "Belgili ro'yxat", descKey: "modules.wiki.blockDesc.bulleted", desc: "Nuqtali ro'yxat", icon: "List" },
  { type: "numbered", labelKey: "modules.wiki.blocks.numbered", label: "Raqamli ro'yxat", descKey: "modules.wiki.blockDesc.numbered", desc: "Tartibli ro'yxat", icon: "ListOrdered" },
  { type: "todo", labelKey: "modules.wiki.blocks.todo", label: "Belgilash ro'yxati", descKey: "modules.wiki.blockDesc.todo", desc: "Bajarilganini belgilash", icon: "ListChecks" },
  { type: "toggle", labelKey: "modules.wiki.blocks.toggle", label: "Yig'iladigan", descKey: "modules.wiki.blockDesc.toggle", desc: "Ochib-yopiladigan blok", icon: "ChevronRight" },
  { type: "quote", labelKey: "modules.wiki.blocks.quote", label: "Iqtibos", descKey: "modules.wiki.blockDesc.quote", desc: "Iqtibos keltirish", icon: "Quote" },
  { type: "callout", labelKey: "modules.wiki.blocks.callout", label: "Eslatma", descKey: "modules.wiki.blockDesc.callout", desc: "Ajratib ko'rsatish", icon: "Info" },
  { type: "code", labelKey: "modules.wiki.blocks.code", label: "Kod", descKey: "modules.wiki.blockDesc.code", desc: "Kod bloki", icon: "Code" },
  { type: "divider", labelKey: "modules.wiki.blocks.divider", label: "Ajratuvchi", descKey: "modules.wiki.blockDesc.divider", desc: "Chiziq", icon: "Minus" },
  { type: "image", labelKey: "modules.wiki.blocks.image", label: "Rasm", descKey: "modules.wiki.blockDesc.image", desc: "Rasm yuklash yoki joylash", icon: "Image" },
];

export const PAGE_EMOJIS = [
  "📄", "📝", "📘", "📗", "📙", "📕", "📓", "📔", "📒", "🗂️",
  "📁", "🗃️", "📊", "📈", "🎯", "💡", "🚀", "⚙️", "🔧", "🧩",
  "🏦", "💰", "🧾", "📑", "🗒️", "✅", "⭐", "🔥", "❤️", "🌟",
  "🏢", "👥", "🤝", "📌", "🔒", "🌐", "🧠", "📦", "🛠️", "🗓️",
];

export const SPACE_EMOJIS = [
  "📚", "🏢", "💼", "🗄️", "📖", "🧭", "🏗️", "🧱", "🔬", "🎨",
  "💻", "📡", "🏦", "⚖️", "🩺", "🏭", "🛒", "🚚", "🧮", "🗂️",
];
