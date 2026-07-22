import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, ArrowRight, BookOpen, Bot, Camera, CheckCircle2, FileText,
  FolderOpen, ListTodo, Sparkles, Wallet, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { squareThumb } from "@/shared/lib/image";
import { useMe, useSetAvatar, useUpdateProfile } from "@/shared/api/me";
import { AibaLogo } from "@/app/layout/aiba-logo";
import { useTabs } from "@/shared/store/tabs";

/** First-login welcome flow: who we are → what the system can do → what's new
 *  → where the guide lives → complete your profile (name, avatar, birthday,
 *  bio). Shows until the profile is stamped `onboarded` (skip also stamps). */

const STEPS = 5;

export function WelcomeDialog() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, { defaultValue: d });
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();
  const setAvatar = useSetAvatar();
  const openTab = useTabs((s) => s.open);

  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [about, setAbout] = useState("");
  const [seeded, setSeeded] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  // Only for logged-in tenant users who haven't been onboarded yet.
  const open = !!me && !!me.tenant && !!me.profile && !me.profile.onboarded;
  // Seed the form once from the loaded profile (effect, not render-phase).
  useEffect(() => {
    if (open && !seeded && me?.profile) {
      setSeeded(true);
      setFirstName(me.profile.firstName ?? "");
      setLastName(me.profile.lastName ?? "");
      setBirthday(me.profile.birthday ?? "");
      setAbout(me.profile.about ?? "");
    }
  }, [open, seeded, me]);
  if (!open) return null;

  const save = (onboarded: boolean) =>
    updateProfile.mutate({ firstName, lastName, birthday, about, onboarded });

  const finish = () => save(true);
  const skip = () => save(true);

  const initials = (me?.username ?? "?").slice(0, 2).toUpperCase();

  const FEATURES = [
    { icon: ListTodo, name: tr("welcome.f.tasks", "Vazifalar"), desc: tr("welcome.f.tasksD", "Jira uslubidagi doska: kartalar, mas'ullar, bildirishnomalar") },
    { icon: BookOpen, name: tr("welcome.f.wiki", "Wiki"), desc: tr("welcome.f.wikiD", "Notion uslubidagi bilim bazasi — sahifalar va bloklar") },
    { icon: FolderOpen, name: tr("welcome.f.files", "Fayllar"), desc: tr("welcome.f.filesD", "Kompaniya diski: papkalar, ulashish, savat") },
    { icon: FileText, name: tr("welcome.f.docs", "Hujjatlar"), desc: tr("welcome.f.docsD", "Kiruvchi/chiquvchi hujjatlar aylanmasi") },
    { icon: Wallet, name: tr("welcome.f.acc", "Buxgalteriya"), desc: tr("welcome.f.accD", "Bank, soliq, hisob-kitoblar — bitta joyda") },
    { icon: Bot, name: tr("welcome.f.ai", "AI yordamchi (MCP)"), desc: tr("welcome.f.aiD", "Claude'ni ulab, vazifalarni chat orqali boshqaring") },
  ];

  const NEWS = [
    tr("welcome.n.1", "🤖 MCP — Claude/ChatGPT'ni tizimga ulash (profil → MCP)"),
    tr("welcome.n.2", "📖 Ichki qo'llanma — har bir amal uchun alohida sahifa"),
    tr("welcome.n.3", "🖼 Rasmlar lightbox'da ochiladi, media Fayllar modulida saqlanadi"),
    tr("welcome.n.4", "📂 Fayllar yangi dizaynda: jonli progress, papka tashlash, sudrab ko'chirish"),
    tr("welcome.n.5", "🔔 Vazifalar bildirishnomalari: tayinlash, muddat, izoh, @mention"),
  ];

  return (
    <Dialog open onOpenChange={() => { /* dismiss only via buttons */ }}>
      <DialogContent
        className="max-w-xl gap-0 p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* header strip */}
        <div className="relative bg-gradient-to-br from-sky-500/15 via-primary/10 to-transparent px-6 pb-4 pt-6">
          <button
            type="button"
            onClick={skip}
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={tr("welcome.skip", "O'tkazib yuborish")}
          >
            <X className="size-4" />
          </button>

          {step === 0 && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-emerald-500/15 shadow-lg">
                <AibaLogo className="size-11" />
              </div>
              <DialogTitle className="text-2xl font-bold">
                {tr("welcome.title", "AIBA Cloud'ga xush kelibsiz!")}
              </DialogTitle>
              <p className="max-w-md text-sm text-muted-foreground">
                {tr("welcome.subtitle", "Biznesingizning barcha ishlari — vazifalar, hujjatlar, fayllar, buxgalteriya va AI yordamchi — bitta platformada.")}
              </p>
            </div>
          )}
          {step === 1 && (
            <DialogTitle className="text-lg font-semibold">
              {tr("welcome.featuresTitle", "Tizim nimalarni biladi")}
            </DialogTitle>
          )}
          {step === 2 && (
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-5 text-sky-500" />
              {tr("welcome.newsTitle", "Tizimda yangi nima bor")}
            </DialogTitle>
          )}
          {step === 3 && (
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="size-5 text-sky-500" />
              {tr("welcome.guideTitle", "O'rganish oson — Qo'llanma")}
            </DialogTitle>
          )}
          {step === 4 && (
            <DialogTitle className="text-lg font-semibold">
              {tr("welcome.profileTitle", "O'zingiz haqingizda")}
            </DialogTitle>
          )}
        </div>

        {/* body */}
        <div className="max-h-[52vh] overflow-y-auto px-6 py-4">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.name} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="text-xs leading-relaxed text-muted-foreground">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <ul className="space-y-2.5">
              {NEWS.map((n, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed">
                  {n}
                </li>
              ))}
            </ul>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm leading-relaxed">
              <p>{tr("welcome.guideText1", "Har bir modul uchun bosqichma-bosqich qo'llanma tayyorladik — skrinshotlar bilan: vazifa yaratishdan AI ulashgacha.")}</p>
              <p className="text-muted-foreground">{tr("welcome.guideText2", "U doim shu yerda: yuqori o'ngdagi profil rasmingiz → «Qo'llanma».")}</p>
              <Button
                variant="outline"
                onClick={() => { openTab("/guide"); finish(); }}
                className="gap-2"
              >
                <BookOpen className="size-4" />
                {tr("welcome.openGuide", "Qo'llanmani ochish")}
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {/* avatar */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="group relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted"
                  title={tr("welcome.avatar", "Rasm yuklash")}
                >
                  {me?.avatar ? (
                    <img src={me.avatar} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-lg font-semibold text-muted-foreground">{initials}</span>
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="size-5 text-white" />
                  </span>
                </button>
                <div className="text-xs text-muted-foreground">
                  {tr("welcome.avatarHint", "Profil rasmingiz vazifalar doskasi va izohlarda ko'rinadi.")}
                </div>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) { try { setAvatar.mutate(await squareThumb(f)); } catch { /* ignore */ } }
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">{tr("welcome.firstName", "Ism")}</span>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">{tr("welcome.lastName", "Familiya")}</span>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{tr("welcome.birthday", "Tug'ilgan kun")}</span>
                <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-44" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">{tr("welcome.about", "O'zingiz haqingizda qisqacha")}</span>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/50"
                  placeholder={tr("welcome.aboutPh", "Lavozim, qiziqishlar…")}
                />
              </label>
            </div>
          )}
        </div>

        {/* footer: dots + nav */}
        <div className="flex items-center gap-2 border-t px-6 py-3.5">
          <div className="flex flex-1 items-center gap-1.5">
            {Array.from({ length: STEPS }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/25",
                )}
              />
            ))}
          </div>
          {step > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} className="gap-1.5">
              <ArrowLeft className="size-4" />
              {tr("welcome.back", "Orqaga")}
            </Button>
          )}
          {step < STEPS - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1.5">
              {tr("welcome.next", "Keyingisi")}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish} disabled={updateProfile.isPending} className="gap-1.5">
              <CheckCircle2 className="size-4" />
              {tr("welcome.finish", "Boshladik!")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
