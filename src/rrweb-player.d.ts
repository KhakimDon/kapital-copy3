// rrweb-player ships its own TS types; we only need to teach tsc about the
// CSS side-effect import (no vite/client *.css ambient decl in this project).
declare module "rrweb-player/dist/style.css";
declare module "*.css";
