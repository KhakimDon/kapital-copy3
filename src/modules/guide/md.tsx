import React from "react";
import { openLightbox } from "@/components/ui/lightbox";

/** Tiny dependency-free Markdown renderer for the user guide.
 *  Supports: #/##/### headings (## gets an anchor id for the sidebar TOC),
 *  paragraphs, **bold**, *italic*, `code`, [link](url), ![img](src),
 *  -/* bullets, 1. numbered lists, > callouts, ``` code fences, --- rules.
 *  Styled to match the wiki module's Notion-like reading experience. */

export type Chapter = { id: string; title: string };

/** Slug for heading anchors (uz/ru letters kept, spaces → dashes). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Extract the `## ` chapters (for the sidebar table of contents). */
export function chaptersOf(md: string): Chapter[] {
  const out: Chapter[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = /^##\s+(.+)$/.exec(line);
    if (m) out.push({ id: slugify(m[1]), title: m[1].trim() });
  }
  return out;
}

/** Rendering context threaded through inline() — `onPageLink` handles the
 *  guide's internal cross-page links (`[title](page:slug)`). */
type Ctx = { onPageLink?: (slug: string) => void };

/** Inline markdown: bold / italic / code / links (incl. `page:` cross-links). */
function inline(text: string, keyBase: string, ctx: Ctx = {}): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenize by the union of inline patterns, longest-match first.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) nodes.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={k} className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("*")) nodes.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      const [, label, href] = lm;
      if (href.startsWith("page:")) {
        // Internal cross-page link — navigates within the guide.
        const slug = href.slice(5);
        nodes.push(
          <button
            key={k}
            type="button"
            onClick={() => ctx.onPageLink?.(slug)}
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {label}
          </button>,
        );
      } else {
        nodes.push(<a key={k} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{label}</a>);
      }
    }
    last = m.index! + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Render a full markdown document. `resolveImg` maps relative image paths
 *  (e.g. `img/board.png`) to bundled asset URLs. */
export function Markdown({ md, resolveImg, onPageLink }: { md: string; resolveImg?: (src: string) => string; onPageLink?: (slug: string) => void }) {
  const ctx: Ctx = { onPageLink };
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const img = (src: string) => (resolveImg ? resolveImg(src) : src);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // code fence
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++; // closing fence
      out.push(
        <pre key={key++} className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-[13px] leading-relaxed">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // hr
    if (/^---+\s*$/.test(line)) { out.push(<hr key={key++} className="my-6 border-border" />); i++; continue; }

    // headings
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const text = h[2].trim();
      if (h[1].length === 1) out.push(<h1 key={key++} className="mb-3 mt-2 text-3xl font-bold tracking-tight">{inline(text, `h`, ctx)}</h1>);
      else if (h[1].length === 2) out.push(<h2 key={key++} id={slugify(text)} className="mb-2 mt-10 scroll-mt-16 border-b border-border pb-1.5 text-xl font-semibold">{inline(text, `h`, ctx)}</h2>);
      else out.push(<h3 key={key++} className="mb-1.5 mt-6 text-base font-semibold">{inline(text, `h`, ctx)}</h3>);
      i++;
      continue;
    }

    // image on its own line
    const im = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line.trim());
    if (im) {
      out.push(
        <figure key={key++} className="my-4">
          <img
            src={img(im[2])}
            alt={im[1]}
            className="max-w-full cursor-zoom-in rounded-xl border border-border shadow-sm"
            loading="lazy"
            onClick={(e) => openLightbox((e.target as HTMLImageElement).src, im[1], e.target as HTMLImageElement)}
          />
          {im[1] && <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">{im[1]}</figcaption>}
        </figure>,
      );
      i++;
      continue;
    }

    // callout
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      out.push(
        <div key={key++} className="my-3 flex gap-2.5 rounded-xl bg-primary/[0.08] px-4 py-3 text-[15px] leading-relaxed">
          <span className="select-none">💡</span>
          <div>{buf.map((b, j) => <p key={j} className={j ? "mt-1.5" : ""}>{inline(b, `q-`, ctx)}</p>)}</div>
        </div>,
      );
      continue;
    }

    // bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ""));
      out.push(
        <ul key={key++} className="my-2.5 space-y-1.5 pl-1">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2 text-[15px] leading-relaxed"><span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-foreground/50" /><span>{inline(it, `ul-`, ctx)}</span></li>
          ))}
        </ul>,
      );
      continue;
    }

    // numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ""));
      out.push(
        <ol key={key++} className="my-2.5 space-y-1.5 pl-1">
          {items.map((it, j) => (
            <li key={j} className="flex gap-2.5 text-[15px] leading-relaxed">
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{j + 1}</span>
              <span>{inline(it, `ol-`, ctx)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // paragraph (merge soft-wrapped lines)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s|>|!\[|```|---)/.test(lines[i])
    ) buf.push(lines[i++]);
    out.push(<p key={key++} className="my-2.5 text-[15px] leading-relaxed">{inline(buf.join(" "), `p`, ctx)}</p>);
  }

  return <div className="pb-16">{out}</div>;
}
