import * as React from "react";

/** Escape regex-special characters so a raw query is matched literally. */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render `text` with every case-insensitive occurrence of `query` wrapped in a
 * yellow <mark>. Empty/whitespace queries render the text unchanged.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  // Capturing group → split keeps the matches at odd indices.
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded-[2px] px-0.5"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}
