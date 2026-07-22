/**
 * HomePromptsSettingsPage — superadmin editor for the home chat welcome
 * screen's rotating suggestion cards. Route: /settings/home-prompts.
 * Each card carries a heading (title), description and the prompt that drops
 * into the composer on click — authored in RU/UZ/EN, with {variable} tokens.
 * Stored platform-wide via PUT /api/v2/admin/home-prompts.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save, Loader2, ChevronUp, ChevronDown, Variable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import {
  useHomePrompts, useUpdateHomePrompts, EMPTY_HOME_PROMPTS,
  PROMPT_LANGS, PROMPT_VARIABLES, emptyLangText,
  type HomePromptsConfig, type HomePrompt, type PromptLang,
} from "@/shared/api/home-prompts";

type FieldKey = "title" | "description" | "prompt";

const LANG_LABEL: Record<PromptLang, string> = { ru: "RU", uz: "UZ", en: "EN" };

function newPrompt(): HomePrompt {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    title: emptyLangText(),
    description: emptyLangText(),
    prompt: emptyLangText(),
  };
}

export function HomePromptsSettingsPage() {
  const { t } = useTranslation();
  const { data } = useHomePrompts();
  const update = useUpdateHomePrompts();
  const [cfg, setCfg] = useState<HomePromptsConfig>(EMPTY_HOME_PROMPTS);
  const [seeded, setSeeded] = useState(false);
  const [lang, setLang] = useState<PromptLang>("ru");

  // remember the last-focused text field so a variable chip inserts at its caret
  const lastFocus = useRef<{ id: string; field: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  useEffect(() => {
    if (data && !seeded) {
      setCfg({ prompts: (data.prompts ?? []).map((p) => ({ ...newPrompt(), ...p })) });
      setSeeded(true);
    }
  }, [data, seeded]);

  const setField = (id: string, field: FieldKey, val: string) =>
    setCfg((c) => ({
      prompts: c.prompts.map((p) => (p.id === id ? { ...p, [field]: { ...p[field], [lang]: val } } : p)),
    }));
  const setEnabled = (id: string, v: boolean) =>
    setCfg((c) => ({ prompts: c.prompts.map((p) => (p.id === id ? { ...p, enabled: v } : p)) }));
  const addPrompt = () => setCfg((c) => ({ prompts: [...c.prompts, newPrompt()] }));
  const removePrompt = (id: string) =>
    setCfg((c) => ({ prompts: c.prompts.filter((p) => p.id !== id) }));
  const move = (id: string, dir: -1 | 1) =>
    setCfg((c) => {
      const i = c.prompts.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.prompts.length) return c;
      const next = [...c.prompts];
      [next[i], next[j]] = [next[j], next[i]];
      return { prompts: next };
    });

  const insertVar = (name: string) => {
    const token = `{${name}}`;
    const f = lastFocus.current;
    if (!f) return;
    const el = f.el;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setField(f.id, f.field, next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const save = () => update.mutate(cfg);

  const fieldProps = (p: HomePrompt, field: FieldKey) => ({
    value: p[field][lang],
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      lastFocus.current = { id: p.id, field, el: e.target };
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setField(p.id, field, e.target.value),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-1">
      <div>
        <h1 className="text-xl font-semibold">{t("modules.homePrompts.title", "Bosh sahifa takliflari")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("modules.homePrompts.subtitle", "Chat bosh sahifasidagi aylanuvchi sarlavha, tavsif va promptlar (3 tilda)")}
        </p>
      </div>

      {/* toolbar: language + add + save */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {PROMPT_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addPrompt}>
          <Plus className="mr-1 size-4" /> {t("modules.homePrompts.add", "Taklif qo'shish")}
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {update.isSuccess && <span className="text-sm text-success">{t("modules.footer.saved", "Saqlandi")}</span>}
          {update.isError && <span className="text-sm text-destructive">{t("common.error", "Xato")}</span>}
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
            {t("common.save", "Saqlash")}
          </Button>
        </div>
      </div>

      {/* variable chips — insert into the focused field */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Variable className="size-3.5" /> {t("modules.homePrompts.variables", "O'zgaruvchilar")}:
        </span>
        {PROMPT_VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            onMouseDown={(e) => e.preventDefault() /* keep the field focused */}
            onClick={() => insertVar(v)}
            className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            {`{${v}}`}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          {t("modules.homePrompts.variablesHint", "matn maydoniga bosib, so'ng o'zgaruvchini tanlang")}
        </span>
      </div>

      {/* prompt cards */}
      {cfg.prompts.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t("modules.homePrompts.empty", "Hali taklif yo'q — «Taklif qo'shish»ni bosing")}
        </p>
      ) : (
        <div className="space-y-3">
          {cfg.prompts.map((p, i) => (
            <section
              key={p.id}
              className={cn(
                "space-y-3 rounded-lg border border-border bg-card p-4",
                !p.enabled && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => move(p.id, -1)} disabled={i === 0} aria-label="up">
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(p.id, 1)} disabled={i === cfg.prompts.length - 1} aria-label="down">
                    <ChevronDown className="size-4" />
                  </Button>
                  <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t("modules.homePrompts.enabled", "Yoqilgan")}
                    <Switch checked={p.enabled} onCheckedChange={(v) => setEnabled(p.id, v)} />
                  </label>
                  <Button variant="ghost" size="icon" onClick={() => removePrompt(p.id)} aria-label="remove">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t("modules.homePrompts.heading", "Sarlavha")} ({LANG_LABEL[lang]})</span>
                <Input placeholder={t("modules.homePrompts.headingPh", "Masalan: {current_company} uchun hisobot")} {...fieldProps(p, "title")} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t("modules.homePrompts.description", "Tavsif")} ({LANG_LABEL[lang]})</span>
                <Textarea rows={2} placeholder={t("modules.homePrompts.descriptionPh", "Sarlavha ostidagi qisqa izoh")} {...fieldProps(p, "description")} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{t("modules.homePrompts.prompt", "Tayyor prompt")} ({LANG_LABEL[lang]})</span>
                <Textarea rows={3} placeholder={t("modules.homePrompts.promptPh", "Bosilganda inputga tushadigan to'liq matn")} {...fieldProps(p, "prompt")} />
              </label>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
