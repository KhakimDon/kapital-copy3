// Header navigation tree — mirrors the cloud aiba_integration top-bar app-menu
// (dropdown-menu.js): a row of icon+label TOP categories, each either a direct
// link or a mega-dropdown with titled columns of icon+title+description links.

export type NavLeaf = {
  key: string;
  title: string;
  // Optional i18n key — when set, renderer uses `t(labelKey)`, else `title`.
  // Lets the header navigate switch to English/Russian/Cyrillic without
  // touching this static tree.
  labelKey?: string;
  // Short description shown under the title in the mega-dropdown (cloud parity).
  desc?: string;
  descKey?: string;
  icon: string;   // lucide-react icon name
  to: string;
  slug?: string;  // module slug → proxy/soon badge lookup
  disabled?: boolean; // "coming soon" — non-clickable, shows a hover tooltip
  adminOnly?: boolean; // hidden from non-admin users (settings flyout)
};

export type NavColumn = {
  key: string;
  title: string;
  labelKey?: string;
  items: NavLeaf[];
};

export type NavTop = {
  key: string;
  label: string;
  labelKey?: string;
  icon: string;
  to?: string;            // direct link (no dropdown)
  columns?: NavColumn[];  // mega-dropdown
  disabled?: boolean;     // present in cloud but no poc module yet
  slug?: string;          // module slug — used by per-tenant nav gating
};

// Пилот AIBA × Kapitalbank (ТЗ P26015): в навигации остаются только
// финансовая аналитика (дашборд), ЭСФ (EDO), банк (остатки на р/с),
// налоги (отчёт по налогу с оборота) и касса (остатки по онлайн-кассе).
export const NAV_TOP: NavTop[] = [
  { key: "dashboard", label: "Dashbord", labelKey: "nav.dashboard", icon: "LayoutDashboard", to: "/dashboard" },

  {
    key: "buxgalteriya",
    label: "Buxgalteriya",
    labelKey: "nav.accounting",
    icon: "Calculator",
    columns: [
      {
        key: "asosiy", title: "Asosiy", labelKey: "nav.navColumns.asosiy",
        items: [
          { key: "documents", title: "EDO (Hujjatlar)", labelKey: "nav.navItems.documents", desc: "Elektron hujjat aylanmasi", descKey: "nav.navDesc.documents", icon: "FileText", to: "/documents", slug: "documents" },
          { key: "bank", title: "Bank", labelKey: "nav.navItems.bank", desc: "Hisoblar va tranzaksiyalar", descKey: "nav.navDesc.bank", icon: "Landmark", to: "/bank", slug: "bank" },
          { key: "soliq", title: "Soliqlar", labelKey: "nav.navItems.soliq", desc: "Soliq ma'lumotlari", descKey: "nav.navDesc.soliq", icon: "Receipt", to: "/soliq", slug: "soliq" },
          { key: "cheklar", title: "Cheklar", labelKey: "nav.navItems.cheklar", desc: "Kassa cheklari (NKM)", descKey: "nav.navDesc.cheklar", icon: "ReceiptText", to: "/soliq/cheques", slug: "soliq" },
        ],
      },
    ],
  },
];

// Right-side settings gear dropdown. Пилот: ЭЦП-ключи нужны для подписи
// ЭСФ и отчёта по налогу с оборота; компании — для контекста организации.
export const ADMIN_ITEMS: NavLeaf[] = [
  { key: "s-keys", title: "ERI Kalitlari", labelKey: "nav.navItems.keys", desc: "Kalitlar va sertifikatlar", descKey: "nav.navDesc.keys", icon: "Key", to: "/settings/keys", slug: "keys" },
  { key: "s-companies", title: "Korxonalar", labelKey: "nav.navItems.companies-admin", desc: "Kompaniyalar boshqaruvi", descKey: "nav.navDesc.companies-admin", icon: "Building2", to: "/settings/companies", slug: "companies" },
];

// Platform-superadmin-only items (rendered in the Settings flyout when the
// current token carries role=superadmin). Tenant control plane.
export const SUPERADMIN_ITEMS: NavLeaf[] = [
  { key: "tenants", title: "Tenantlar", labelKey: "nav.navItems.tenants", desc: "Tenantlar boshqaruvi (limit, expiry)", descKey: "nav.navDesc.tenants", icon: "Network", to: "/settings/tenants", slug: "tenants" },
  { key: "footer", title: "Login footer", labelKey: "nav.navItems.footer", desc: "Login sahifasi havolalari va ijtimoiy tarmoqlar", descKey: "nav.navDesc.footer", icon: "PanelBottom", to: "/settings/footer", slug: "footer" },
  { key: "home-prompts", title: "Bosh sahifa takliflari", labelKey: "nav.navItems.homePrompts", desc: "Chat bosh sahifasidagi sarlavha va promptlar", descKey: "nav.navDesc.homePrompts", icon: "Sparkles", to: "/settings/home-prompts", slug: "home-prompts" },
  { key: "gitlab", title: "GitLab monitoring", labelKey: "nav.navItems.gitlab", desc: "Pipeline holati — deploy paytida logo animatsiyasi", descKey: "nav.navDesc.gitlab", icon: "GitBranch", to: "/settings/gitlab", slug: "gitlab" },
  { key: "task-files", title: "Vazifa fayllari", labelKey: "nav.navItems.taskFiles", desc: "Vazifalarga biriktiriladigan fayl turlari", descKey: "nav.navDesc.taskFiles", icon: "Paperclip", to: "/settings/task-files", slug: "task-files" },
];
