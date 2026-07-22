import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Upload, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCompanies, useUploadKey } from "../api";
import type { CompanyItem } from "../types";

// ── Company picker modal (1:1 with NC bh-company-modal) ───────────────────────
export function CompanyPickerModal({
  open, onOpenChange, onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (c: CompanyItem) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useCompanies(open);
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return (data ?? []).filter((c) =>
      `${c.name || ""} ${c.inn || ""}`.toLowerCase().includes(needle)
    );
  }, [data, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("modules.baholash.pickFirmTitle")}</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.baholash.searchPlaceholder")} className="pl-8 h-9" />
        </div>
        <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 space-y-1">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
          ) : rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm animate-in fade-in-0 duration-300">—</div>
          ) : (
            rows.map((c, i) => (
              <Button
                key={c.id}
                variant="outline"
                onClick={() => onPick(c)}
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                className="w-full h-auto flex items-center justify-between gap-3 px-3 py-2.5 text-left font-normal animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
              >
                <span className="font-medium text-sm truncate">{c.name || "—"}</span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">{c.inn || ""}</span>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ESP key upload modal (1:1 with NC bh-key-modal) ───────────────────────────
export function KeyUploadModal({
  open, onOpenChange, onResolved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onResolved: (inn: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const upload = useUploadKey();

  function reset() {
    setFile(null); setPassword(""); setError("");
  }

  async function submit() {
    setError("");
    if (!file) { setError(t("modules.baholash.keyModal.errors.pickFile")); return; }
    try {
      const d = await upload.mutateAsync({ file, password });
      if (!d || d.error || !d.inn) {
        setError(d?.error ? `${t("modules.baholash.keyModal.errors.error")}: ${d.error}` : t("modules.baholash.keyModal.errors.innNotFound"));
        return;
      }
      onResolved(d.inn, d.name || "");
      reset();
      onOpenChange(false);
    } catch {
      setError(t("modules.baholash.keyModal.errors.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" /> {t("modules.baholash.keyModal.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("modules.baholash.keyModal.body")}
        </p>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("modules.baholash.keyModal.fileLabel")}</span>
            <Input type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-9" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("modules.baholash.keyModal.passwordLabel")}</span>
            <Input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9" />
          </label>
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
          )}
          <Button onClick={submit} disabled={upload.isPending} className="w-full">
            <Upload className="size-4" /> {upload.isPending ? t("modules.baholash.keyModal.uploading") : t("modules.baholash.keyModal.uploadAndEvaluate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
