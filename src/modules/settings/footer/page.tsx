/**
 * FooterSettingsPage — superadmin editor for the login-screen footer.
 * Route: /settings/footer. Edits legal/info links + social URLs; stored
 * platform-wide via PUT /api/v2/admin/footer.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save, Loader2, Instagram, Linkedin, Facebook, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useFooterConfig, useUpdateFooter, EMPTY_FOOTER,
  type FooterConfig, type FooterSocials,
} from "@/shared/api/footer";

const SOCIALS: { key: keyof FooterSocials; Icon: typeof Instagram; label: string; ph: string }[] = [
  { key: "instagram", Icon: Instagram, label: "Instagram", ph: "https://instagram.com/…" },
  { key: "linkedin", Icon: Linkedin, label: "LinkedIn", ph: "https://linkedin.com/company/…" },
  { key: "telegram", Icon: Send, label: "Telegram", ph: "https://t.me/…" },
  { key: "facebook", Icon: Facebook, label: "Facebook", ph: "https://facebook.com/…" },
];

export function FooterSettingsPage() {
  const { t } = useTranslation();
  const { data } = useFooterConfig();
  const update = useUpdateFooter();
  const [cfg, setCfg] = useState<FooterConfig>(EMPTY_FOOTER);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setCfg({ links: data.links ?? [], socials: { ...EMPTY_FOOTER.socials, ...data.socials } });
      setSeeded(true);
    }
  }, [data, seeded]);

  const setLink = (i: number, patch: Partial<{ label: string; url: string }>) =>
    setCfg((c) => ({ ...c, links: c.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLink = () => setCfg((c) => ({ ...c, links: [...c.links, { label: "", url: "" }] }));
  const removeLink = (i: number) =>
    setCfg((c) => ({ ...c, links: c.links.filter((_, j) => j !== i) }));
  const setSocial = (k: keyof FooterSocials, v: string) =>
    setCfg((c) => ({ ...c, socials: { ...c.socials, [k]: v } }));

  const save = () =>
    update.mutate({ links: cfg.links.filter((l) => l.label.trim()), socials: cfg.socials });

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-1">
      <div>
        <h1 className="text-xl font-semibold">{t("modules.footer.title", "Login footer")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("modules.footer.subtitle", "Login sahifasidagi havolalar va ijtimoiy tarmoqlar")}
        </p>
      </div>

      {/* Links */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t("modules.footer.links", "Havolalar")}</h2>
          <Button variant="outline" size="sm" onClick={addLink}>
            <Plus className="mr-1 size-4" /> {t("modules.footer.addLink", "Havola qo'shish")}
          </Button>
        </div>
        {cfg.links.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("modules.footer.noLinks", "Havola yo'q")}</p>
        ) : (
          cfg.links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder={t("modules.footer.label", "Nomi")}
                value={l.label}
                onChange={(e) => setLink(i, { label: e.target.value })}
              />
              <Input
                className="flex-[2]"
                placeholder="https://…"
                value={l.url}
                onChange={(e) => setLink(i, { url: e.target.value })}
              />
              <Button variant="ghost" size="icon" onClick={() => removeLink(i)} aria-label="remove">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </section>

      {/* Socials */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{t("modules.footer.socials", "Ijtimoiy tarmoqlar")}</h2>
        {SOCIALS.map(({ key, Icon, ph }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
              <Icon />
            </span>
            <Input
              className="flex-1"
              placeholder={ph}
              value={cfg.socials[key] ?? ""}
              onChange={(e) => setSocial(key, e.target.value)}
            />
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
          {t("common.save", "Saqlash")}
        </Button>
        {update.isSuccess && <span className="text-sm text-success">{t("modules.footer.saved", "Saqlandi")}</span>}
        {update.isError && <span className="text-sm text-destructive">{t("common.error", "Xato")}</span>}
      </div>
    </div>
  );
}
