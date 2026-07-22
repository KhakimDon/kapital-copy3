/**
 * Public share page — /s/:token, no auth. Shows the shared file (download) or
 * folder (browse + per-file download). Password-protected shares prompt first.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import {
  ChevronRight, Download, FileQuestion, Loader2, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPublicView, publicDownloadUrl } from "./api";
import { nodeVisual } from "./icons";
import { errMsg, fmtSize, fmtStamp } from "./lib";
import type { PublicView } from "./types";

export function PublicSharePage() {
  const { t: tr } = useTranslation();
  const { token = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const dirParam = sp.get("dir");
  const dir = dirParam ? Number(dirParam) || undefined : undefined;

  const [view, setView] = useState<PublicView | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [activePassword, setActivePassword] = useState<string | undefined>(undefined);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (pw?: string, d?: number) => {
    setLoading(true);
    setErr("");
    try {
      const data = await getPublicView(token, pw, d);
      setView(data);
      setNeedPassword(false);
      setActivePassword(pw);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setNeedPassword(true);
        if (pw) setErr(tr("modules.files.publicWrongPassword"));
      } else if (status === 410) {
        setErr(tr("modules.files.publicExpired"));
      } else if (status === 404) {
        setErr(tr("modules.files.publicNotFound"));
      } else {
        setErr(errMsg(e));
      }
    } finally {
      setLoading(false);
    }
  }, [token, tr]);

  useEffect(() => { load(activePassword, dir); }, [load, dir]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (id?: number) => {
    const next = new URLSearchParams(sp);
    if (id == null) next.delete("dir");
    else next.set("dir", String(id));
    setSp(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-2">
          <span className="font-semibold">AIBA Cloud</span>
          <span className="text-muted-foreground text-sm">· {tr("modules.files.publicShared")}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-7 animate-spin text-muted-foreground" />
          </div>
        ) : needPassword ? (
          <div className="mx-auto max-w-sm rounded-lg border bg-card p-6 space-y-3 text-center">
            <Lock className="size-8 mx-auto text-muted-foreground" />
            <div className="font-medium">{tr("modules.files.publicPasswordTitle")}</div>
            <Input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tr("modules.files.publicPasswordPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && load(password, dir)}
            />
            {err && <div className="text-xs text-destructive">{err}</div>}
            <Button className="w-full" onClick={() => load(password, dir)} disabled={!password}>
              {tr("modules.files.publicOpen")}
            </Button>
          </div>
        ) : err ? (
          <div className="mx-auto max-w-sm rounded-lg border bg-card p-6 space-y-2 text-center">
            <FileQuestion className="size-8 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground">{err}</div>
          </div>
        ) : view ? (
          <SharedContent
            view={view}
            token={token}
            password={activePassword}
            onNavigate={goTo}
          />
        ) : null}
      </main>
    </div>
  );
}

function SharedContent({
  view, token, password, onNavigate,
}: {
  view: PublicView;
  token: string;
  password?: string;
  onNavigate: (id?: number) => void;
}) {
  const { t: tr } = useTranslation();
  const { Icon, cls } = nodeVisual(view);

  if (!view.is_dir) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border bg-card p-6 space-y-3 text-center">
        <Icon className={`size-10 mx-auto ${cls}`} />
        <div className="font-medium break-all">{view.name}</div>
        <div className="text-xs text-muted-foreground">
          {fmtSize(view.size)} · {fmtStamp(view.updated_at)}
        </div>
        <Button asChild className="w-full">
          <a href={publicDownloadUrl(token, { password })}>
            <Download className="size-4 mr-1.5" />
            {tr("modules.files.download")}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        <Button
          variant="link"
          onClick={() => onNavigate(undefined)}
          className="flex h-auto items-center gap-1 p-0 text-sm font-medium text-foreground no-underline hover:underline [&_svg]:size-4"
        >
          <Icon className={`size-4 ${cls}`} />
          {view.name}
        </Button>
        {view.breadcrumb.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            <Button
              variant="link"
              onClick={() => onNavigate(c.id)}
              className="h-auto p-0 text-sm font-normal text-foreground no-underline hover:underline"
            >
              {c.name}
            </Button>
          </span>
        ))}
      </nav>

      <div className="rounded-lg border bg-card overflow-hidden divide-y">
        {(view.items ?? []).length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {tr("modules.files.empty")}
          </div>
        ) : (view.items ?? []).map((n) => {
          const v = nodeVisual(n);
          return (
            <div key={n.id} className="flex items-center gap-3 px-4 py-2.5">
              {n.is_dir ? (
                <Button
                  variant="link"
                  onClick={() => onNavigate(n.id)}
                  className="flex h-auto min-w-0 flex-1 justify-start gap-2 p-0 text-left font-normal text-foreground no-underline hover:underline"
                >
                  <v.Icon className={`size-4 shrink-0 ${v.cls}`} />
                  <span className="truncate font-medium">{n.name}</span>
                </Button>
              ) : (
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <v.Icon className={`size-4 shrink-0 ${v.cls}`} />
                  <span className="truncate font-medium">{n.name}</span>
                </span>
              )}
              <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                {n.is_dir ? "—" : fmtSize(n.size)}
              </span>
              {!n.is_dir && (
                <a
                  href={publicDownloadUrl(token, { childId: n.id, password })}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title={tr("modules.files.download")}
                >
                  <Download className="size-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
