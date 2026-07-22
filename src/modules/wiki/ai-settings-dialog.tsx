import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAiSettings, useSaveAiSettings } from "./ai";

/** Admin dialog to configure the server-side OpenAI token + model. The token is
 *  write-only from the UI — we only ever learn whether one is set, never read it
 *  back (it lives on the backend). */
export function AiSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useAiSettings(open);
  const save = useSaveAiSettings();
  const [token, setToken] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) { setToken(""); setModel(data?.model ?? "gpt-4o-mini"); setSaved(false); }
  }, [open, data?.model]);

  const onSave = async () => {
    await save.mutateAsync({ token: token.trim() || undefined, model: model.trim() || undefined });
    setToken("");
    setSaved(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {t("modules.wiki.ai.settingsTitle", { defaultValue: "AI sozlamalari" })}
          </DialogTitle>
          <DialogDescription>
            {t("modules.wiki.ai.settingsHint", { defaultValue: "OpenAI tokeni serverda saqlanadi va brauzerga chiqmaydi. Barcha foydalanuvchilar AI'dan foydalana oladi." })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t("modules.wiki.ai.token", { defaultValue: "OpenAI token" })}</span>
              {data?.has_token && (
                <span className="inline-flex items-center gap-1 text-success">
                  <Check className="size-3" /> {t("modules.wiki.ai.tokenSet", { defaultValue: "O'rnatilgan" })}
                </span>
              )}
            </div>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              placeholder={data?.has_token ? "•••••••••• (o'zgartirish uchun kiriting)" : "sk-…"}
              className="font-mono"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">{t("modules.wiki.ai.model", { defaultValue: "Model" })}</div>
            <Input value={model} onChange={(e) => setModel(e.target.value)} className="font-mono" placeholder="gpt-4o-mini" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && <span className="mr-auto text-sm text-success">{t("common.saved", { defaultValue: "Saqlandi" })}</span>}
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={onSave} disabled={save.isPending || (!token.trim() && !data?.has_token)}>
            {save.isPending ? "…" : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
