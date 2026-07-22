// Jira-style view-tab glyphs (Kanban / List / Calendar / Timeline / Reports).
// Hand-traced from the reference set; each inherits `currentColor` and takes a
// className so it drops into the tab strip exactly like a lucide icon.
type IconProps = { className?: string };

// The source glyphs are drawn in a 16×16 box but shipped with a `-4 -4 24 24`
// viewBox — i.e. 4 units of built-in padding on every side, which made them
// render visibly smaller than the neighbouring lucide icons. Cropping the
// viewBox to the glyph's real 0..16 bounds removes that margin so they match.
const wrap = (children: React.ReactNode) => (props: IconProps) => (
  <svg fill="none" viewBox="0 0 16 16" role="presentation" className={props.className}>
    {children}
  </svg>
);

export const TimelineIcon = wrap(
  <path
    fill="currentColor"
    fillRule="evenodd"
    clipRule="evenodd"
    d="M0 4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5zM3 11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2-.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5z"
  />,
);

export const ListIcon = wrap(
  <path
    fill="currentColor"
    fillRule="evenodd"
    clipRule="evenodd"
    d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-.5a.5.5 0 0 0-.5.5v2.167h11V3a.5.5 0 0 0-.5-.5zm10.5 4.167h-11v2.666h11zm0 4.166h-11V13a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5z"
  />,
);

export const KanbanIcon = wrap(
  <path
    fill="currentColor"
    fillRule="evenodd"
    clipRule="evenodd"
    d="M2 3.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h2.833v-9zm4.333 0v9h3.334v-9zm4.834 0v9H14a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5zM0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2z"
  />,
);

export const CalendarIcon = wrap(
  <path
    fill="currentColor"
    fillRule="evenodd"
    clipRule="evenodd"
    d="M4.5 2.5v2H6v-2h4v2h1.5v-2H13a.5.5 0 0 1 .5.5v3h-11V3a.5.5 0 0 1 .5-.5zm-2 5V13a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V7.5zm9-6.5H13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1.5V0H6v1h4V0h1.5z"
  />,
);

export const SearchIcon = wrap(
  <path
    fill="currentColor"
    fillRule="evenodd"
    clipRule="evenodd"
    d="M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M1 7a6 6 0 1 1 10.74 3.68l3.29 3.29-1.06 1.06-3.29-3.29A6 6 0 0 1 1 7"
  />,
);

export const ReportsIcon = wrap(
  <>
    <path fill="currentColor" d="M1 13V1h1.5v12a.5.5 0 0 0 .5.5h12V15H3a2 2 0 0 1-2-2" />
    <path
      fill="currentColor"
      d="M15 7.5h-1.5V5.56L9.78 9.28a.75.75 0 0 1-1.06 0L7.25 7.81l-2.22 2.22-1.06-1.06 2.75-2.75.056-.052a.75.75 0 0 1 1.004.052l1.47 1.47 3.19-3.19H10.5V3h3.75a.75.75 0 0 1 .75.75z"
    />
  </>,
);
