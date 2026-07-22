// Lightweight WYSIWYG editor for the compose window — a contentEditable surface
// with a small formatting toolbar (bold / italic / underline / lists / link).
// Emits HTML via onChange. Kept dependency-free (uses document.execCommand,
// which is deprecated but universally supported and plenty for email bodies).
import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function RichTextEditor({
  html,
  onChange,
  placeholder,
  className,
}: {
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed initial content once (uncontrolled after mount so the caret doesn't
  // jump on every keystroke). Re-seed only when the incoming html is set from
  // outside AND differs from what's rendered (e.g. reply prefill).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html) {
      el.innerHTML = html;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  const link = () => {
    const url = window.prompt("URL:");
    if (url) exec("createLink", url);
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-0.5 border-b pb-1.5">
        <ToolBtn onClick={() => exec("bold")} title="Bold">
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic">
          <Italic className="size-4" />
        </ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Underline">
          <Underline className="size-4" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Bulleted list">
          <List className="size-4" />
        </ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Numbered list">
          <ListOrdered className="size-4" />
        </ToolBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolBtn onClick={link} title="Link">
          <Link2 className="size-4" />
        </ToolBtn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        data-placeholder={placeholder}
        className={cn(
          "mail-editor min-h-[14rem] flex-1 overflow-y-auto py-3 text-[15px] leading-relaxed outline-none",
          "[&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
        )}
      />
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      // Keep focus in the editor so execCommand applies to the selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
