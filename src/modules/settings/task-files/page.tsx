/**
 * TaskFilesSettingsPage — superadmin editor for which file types may be
 * attached to tasks (and the size cap). Route: /settings/task-files.
 * Read by every user (upload validation); only superadmin can change it.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Save, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilePolicy, useUpdateFilePolicy, DEFAULT_FILE_POLICY } from "@/shared/api/task-files";

export function TaskFilesSettingsPage() {
  const { t } = useTranslation();
  const { data } = useFilePolicy();
  const update = useUpdateFilePolicy();
  const [exts, setExts] = useState<string[]>(DEFAULT_FILE_POLICY.extensions);
  const [maxMb, setMaxMb] = useState(DEFAULT_FILE_POLICY.maxMb);
  const [draft, setDraft] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (data && !seeded) { setExts(data.extensions ?? []); setMaxMb(data.maxMb ?? 25); setSeeded(true); }
  }, [data, seeded]);

  const addExt = () => {
    const v = draft.trim().toLowerCase().replace(/^\./, "").replace(/[^a-z0-9]/g, "");
    if (v && !exts.includes(v)) setExts((e) => [...e, v]);
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-1">
      <div>
        <h1 className="text-xl font-semibold">
          {t("modules.taskFiles.title", { defaultValue: "Vazifa fayllari — ruxsat etilgan turlar" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("modules.taskFiles.subtitle", { defaultValue: "Vazifalarga qanday fayllar biriktirilishi mumkinligini boshqaring. Bo'sh ro'yxat — hammasi ruxsat." })}
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium">{t("modules.taskFiles.extensions", { defaultValue: "Ruxsat etilgan kengaytmalar" })}</div>
        <div className="flex flex-wrap gap-1.5">
          {exts.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-mono">
              .{e}
              <button type="button" onClick={() => setExts((v) => v.filter((x) => x !== e))} className="hover:text-destructive"><X className="size-3" /></button>
            </span>
          ))}
          {exts.length === 0 && <span className="text-xs text-muted-foreground">{t("modules.taskFiles.any", { defaultValue: "Cheklovsiz (hamma turlar)" })}</span>}
        </div>
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExt(); } }}
            placeholder={t("modules.taskFiles.addPlaceholder", { defaultValue: "masalan: png" })} className="h-9 w-40" />
          <Button variant="outline" size="sm" onClick={addExt}><Plus className="size-4" /> {t("common.add", { defaultValue: "Qo'shish" })}</Button>
        </div>

        <div className="pt-2">
          <label className="text-sm font-medium">{t("modules.taskFiles.maxMb", { defaultValue: "Maksimal hajm (MB)" })}</label>
          <Input type="number" min={1} value={maxMb} onChange={(e) => setMaxMb(Number(e.target.value) || 0)} className="mt-1 h-9 w-32" />
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => update.mutate({ extensions: exts, maxMb })} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("common.save", { defaultValue: "Saqlash" })}
        </Button>
      </div>
    </div>
  );
}
