// Minimal hand-rolled Markdown renderer for AI chat bubbles.
// Supports: # / ## / ### headings, paragraphs, fenced ```code```, `inline code`,
// **bold**, *italic*, [link](url), - / * / 1. lists, > blockquote.
// Sanitization rule: never emit raw HTML from the source — every interpolation
// goes through React's text node escaping. We only render trusted JSX wrappers.

import { Fragment, type ReactNode } from "react";

export interface MdRendererProps {
  source: string;
  className?: string;
}

// Inline parser: order matters (fenced/inline code must win over emphasis so
// `**not bold**` inside backticks stays literal).
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Tokenize against a single regex with alternations.
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-i${idx++}`;
    if (tok.startsWith("`")) {
      out.push(<code key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k} className="font-semibold">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={k} className="italic">{tok.slice(1, -1)}</em>);
    } else {
      // [text](url)
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (linkMatch) {
        out.push(
          <a key={k} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
             className="text-primary underline-offset-2 hover:underline">{linkMatch[1]}</a>
        );
      } else {
        out.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MdRenderer({ source, className }: MdRendererProps) {
  if (!source) return null;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let bIdx = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      if (i < lines.length) i++; // closing fence
      blocks.push(
        <pre key={`b${bIdx++}`} className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[12px] leading-relaxed">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }
    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const cls = level === 1 ? "mt-3 mb-1.5 text-[18px] font-bold" : level === 2 ? "mt-2.5 mb-1 text-[16px] font-semibold" : "mt-2 mb-1 text-[14px] font-semibold";
      const k = `b${bIdx++}`;
      if (level === 1) blocks.push(<h1 key={k} className={cls}>{renderInline(text, k)}</h1>);
      else if (level === 2) blocks.push(<h2 key={k} className={cls}>{renderInline(text, k)}</h2>);
      else blocks.push(<h3 key={k} className={cls}>{renderInline(text, k)}</h3>);
      i++;
      continue;
    }
    // Blockquote (consecutive lines)
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      const k = `b${bIdx++}`;
      blocks.push(
        <blockquote key={k} className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
          {buf.map((t, j) => <p key={`${k}-p${j}`}>{renderInline(t, `${k}-p${j}`)}</p>)}
        </blockquote>
      );
      continue;
    }
    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
      const k = `b${bIdx++}`;
      blocks.push(
        <ul key={k} className="my-1.5 list-disc space-y-0.5 pl-5">
          {items.map((t, j) => <li key={`${k}-l${j}`}>{renderInline(t, `${k}-l${j}`)}</li>)}
        </ul>
      );
      continue;
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, "")); i++; }
      const k = `b${bIdx++}`;
      blocks.push(
        <ol key={k} className="my-1.5 list-decimal space-y-0.5 pl-5">
          {items.map((t, j) => <li key={`${k}-l${j}`}>{renderInline(t, `${k}-l${j}`)}</li>)}
        </ol>
      );
      continue;
    }
    // Blank line — paragraph separator.
    if (line.trim() === "") { i++; continue; }
    // Paragraph: collect consecutive non-blank, non-special lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) { para.push(lines[i]); i++; }
    const k = `b${bIdx++}`;
    blocks.push(
      <p key={k} className="my-1 leading-relaxed">
        {para.map((t, j) => (
          <Fragment key={`${k}-s${j}`}>
            {renderInline(t, `${k}-s${j}`)}
            {j < para.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    );
  }
  return <div className={className}>{blocks}</div>;
}
