import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { User, Lock, Eye, EyeOff, Loader2, Globe, ChevronDown, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/shared/store/auth";
import { useCompany } from "@/shared/store/company";
import { api } from "@/shared/api/client";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WALLPAPERS } from "@/shared/store/wallpaper";
import { LoginFooter } from "./footer";
// Static SVG monogram (not AnimatedLogo) so the login screen never fetches the
// 1.4 MB logo animation webm.
import { AibaLogo } from "@/app/layout/aiba-logo";

type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  username: string;
  display_name: string | null;
  is_admin: boolean;
};

type AdminContact = { name: string; phone: string | null };
type AdminContactResponse = { found: boolean; admins: AdminContact[] };

const LANGS: { value: string; label: string }[] = [
  { value: "uz", label: "O'zbekcha" },
  { value: "uz_Cyrl", label: "Ўзбекча" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

// Language picker for the login screen — a frosted pill in the top-right corner.
function LangSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.value === i18n.language) ?? LANGS[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/20"
        >
          <Globe className="size-4" />
          {current.label}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-44 p-1">
        {LANGS.map((l) => {
          const on = i18n.language === l.value;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => { void setLanguage(l.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                on ? "bg-primary/10 text-primary" : "hover:bg-black/5 dark:hover:bg-white/10",
              )}
            >
              <span className="truncate">{l.label}</span>
              {on && <Check className="size-3.5 shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const setSession = useAuth((s) => s.setSession);
  const resetCompany = useCompany((s) => s.setCurrent);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false); // fade-out before handing off to the shell

  // "Forgot password" mode — self-service reset is NOT offered; instead we look
  // up the tenant admin(s) and tell the user to contact them.
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [fgUsername, setFgUsername] = useState("");
  const [fgSubmitting, setFgSubmitting] = useState(false);
  const [fgResult, setFgResult] = useState<string | null>(null);

  // Random wallpaper per visit — picked once on mount so every login screen
  // shows a different one of the desktop backdrops.
  const [wp] = useState(() => WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)]);
  const [bgLoaded, setBgLoaded] = useState(false);

  // Autofocus the username — but ONLY when the browser hasn't autofilled the
  // credentials. A short delay lets Chrome's on-load autofill land first; if the
  // field ends up filled (value or the :-webkit-autofill state) we leave focus
  // alone so the password chooser doesn't pop and the text doesn't restyle.
  const userRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const el = userRef.current;
      if (!el) return;
      let autofilled = el.value.trim() !== "";
      try { autofilled = autofilled || el.matches(":-webkit-autofill"); } catch { /* pseudo unsupported */ }
      if (!autofilled) el.focus();
    }, 150);
    return () => clearTimeout(id);
  }, []);

  // Auto-dismiss the error snackbar (iOS-style toast) after a few seconds.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(id);
  }, [error]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setError(t("auth.fieldsRequired", "Login va parol majburiy"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // POST /api/v2/auth/login — tenant user (NextCloud-mirrored auth.users).
      // On 401, retry as a platform superadmin (control.superadmins) so one form
      // serves both. Superadmin token carries role=superadmin (no tenant).
      // No tenant field: the backend auto-detects which tenant this (username,
      // password) belongs to. After login the JWT carries the tenant, so every
      // later request auto-routes.
      let data: LoginResponse;
      try {
        data = (await api.post<LoginResponse>("/auth/login", { username: u, password: p })).data;
      } catch (tenantErr: unknown) {
        const status = (tenantErr as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 404) {
          data = (await api.post<LoginResponse>("/admin/login", { username: u, password: p })).data;
        } else {
          throw tenantErr;
        }
      }
      // New tenant session: drop any cached cross-tenant data + selected company
      // so we never show the previous tenant's companies/lists.
      qc.clear();
      resetCompany(null);
      // Fade the login screen out first, then hand off to the shell so the
      // transition dissolves smoothly instead of hard-cutting.
      setLeaving(true);
      setTimeout(() => {
        setSession(data.access_token, data.username);
        nav("/", { replace: true });
      }, 420);
      return;
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || t("auth.loginFailed", "Login yoki parol noto'g'ri");
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  function openForgot() {
    setError(null);
    setFgResult(null);
    setFgUsername(username.trim()); // carry over whatever they typed
    setMode("forgot");
  }

  function backToLogin() {
    setError(null);
    setFgResult(null);
    setMode("login");
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    const u = fgUsername.trim();
    if (!u) {
      setError(t("auth.fieldsRequired", "Login va parol majburiy"));
      return;
    }
    setError(null);
    setFgResult(null);
    setFgSubmitting(true);
    try {
      // POST /api/v2/auth/admin-contact — public endpoint (no token). The backend
      // auto-detects the tenant, so we don't pin X-Tenant (login doesn't either).
      const { data } = await api.post<AdminContactResponse>("/auth/admin-contact", { username: u });
      if (data.found && data.admins.length > 0) {
        const names = data.admins
          .map((a) => (a.phone ? `${a.name} · ${a.phone}` : a.name))
          .join(", ");
        setFgResult(t("auth.forgot.contactAdmin", { name: names }));
      } else {
        setFgResult(t("auth.forgot.contactAdminGeneric"));
      }
    } catch {
      // Network / server error: still give the user an actionable next step
      // rather than a dead end.
      setFgResult(t("auth.forgot.contactAdminGeneric"));
    } finally {
      setFgSubmitting(false);
    }
  }

  // Shared input styling — translucent glass field with light text. The
  // `login-input` class (see index.css) keeps Chrome's autofill from repainting
  // the glass and keeps the autofilled text/caret white across all states.
  const field =
    "login-input h-11 bg-white/10 border-white/20 text-white placeholder:text-white/50 " +
    "focus-visible:border-white/40 focus-visible:ring-white/30";

  return (
    <div
      className={cn(
        "relative flex min-h-screen items-center justify-center overflow-hidden p-4 transition-opacity duration-500 ease-out",
        leaving ? "opacity-0" : "opacity-100",
      )}
    >
      {/* Random wallpaper backdrop — 3-layer blur-up so there's no white flash:
          (1) average colour, (2) a 40px embedded LQIP blurred up, (3) the full
          photo that fades in once it has loaded. */}
      <div className="absolute inset-0" style={{ backgroundColor: wp.color }} />
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url(${wp.lqip})` }}
      />
      <img
        // A cached image can finish before React attaches onLoad — the ref
        // catches that case so the photo never stays stuck invisible.
        ref={(el) => { if (el?.complete && el.naturalWidth > 0) setBgLoaded(true); }}
        src={wp.file}
        alt=""
        aria-hidden
        onLoad={() => setBgLoaded(true)}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out",
          bgLoaded ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/40 to-black/60" />

      {/* Language switcher — top-right corner */}
      <div className="absolute right-4 top-4 z-10">
        <LangSwitcher />
      </div>

      {/* iOS-style error snackbar — floats at the top, tap or wait to dismiss */}
      {error && (
        <div className="fixed inset-x-0 top-5 z-50 flex justify-center px-4">
          <button
            type="button"
            onClick={() => setError(null)}
            className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border border-white/10 bg-neutral-900/80 px-4 py-3 text-left text-sm font-medium text-white shadow-2xl backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-3 duration-300"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
              <AlertCircle className="size-4" />
            </span>
            {error}
          </button>
        </div>
      )}

      {/* Liquid-glass card (macOS Control-Center look) */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/20 bg-white/10 p-7 shadow-2xl backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 duration-300">
        {/* glass sheen: soft top highlight + crisp top edge */}
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/20 via-white/5 to-transparent" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/40" />

        <div className="relative">
          {/* Logo on top */}
          <div className="flex flex-col items-center gap-2.5 pb-6">
            <AibaLogo className="size-20 drop-shadow-lg" />
            <div className="text-center">
              <div className="text-lg font-semibold tracking-tight text-white">AIBA Cloud</div>
              <div className="mt-0.5 text-xs text-white/60">
                {mode === "login" ? t("auth.login") : t("auth.forgot.title")}
              </div>
            </div>
          </div>

          {mode === "login" ? (
          <form onSubmit={submit} className="space-y-3">
            {/* Username */}
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
              <Input
                ref={userRef}
                className={cn(field, "pl-9")}
                placeholder={t("auth.username")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            {/* Password + show/hide toggle */}
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
              <Input
                type={showPw ? "text" : "password"}
                className={cn(field, "px-9")}
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={showPw ? t("auth.hidePassword", "Yashirish") : t("auth.showPassword", "Ko'rsatish")}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full gap-2 border-0 bg-white font-semibold text-neutral-900 shadow-lg hover:bg-white/90"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? t("auth.signingIn", "Kirilmoqda…") : t("auth.submit")}
            </Button>

            {/* Forgot-password entry point */}
            <button
              type="button"
              onClick={openForgot}
              disabled={submitting}
              className="mx-auto block pt-1 text-sm font-medium text-white/70 transition-colors hover:text-white disabled:opacity-50"
            >
              {t("auth.forgot.link")}
            </button>
          </form>
          ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-white/70">{t("auth.forgot.hint")}</p>

            <form onSubmit={submitForgot} className="space-y-3">
              {/* Login / username */}
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/60" />
                <Input
                  className={cn(field, "pl-9")}
                  placeholder={t("auth.forgot.loginLabel")}
                  aria-label={t("auth.forgot.loginLabel")}
                  value={fgUsername}
                  onChange={(e) => setFgUsername(e.target.value)}
                  autoFocus
                  required
                  disabled={fgSubmitting}
                />
              </div>

              <Button
                type="submit"
                disabled={fgSubmitting}
                className="h-11 w-full gap-2 border-0 bg-white font-semibold text-neutral-900 shadow-lg hover:bg-white/90"
              >
                {fgSubmitting && <Loader2 className="size-4 animate-spin" />}
                {t("auth.forgot.submit")}
              </Button>
            </form>

            {/* Resolved admin contact (or generic fallback) */}
            {fgResult && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm leading-relaxed text-white"
              >
                {fgResult}
              </div>
            )}

            <button
              type="button"
              onClick={backToLogin}
              disabled={fgSubmitting}
              className="mx-auto block pt-1 text-sm font-medium text-white/70 transition-colors hover:text-white disabled:opacity-50"
            >
              {t("auth.forgot.back")}
            </button>
          </div>
          )}
        </div>
      </div>

      {/* Legal/info links + socials, editable from the superadmin panel */}
      <LoginFooter />
    </div>
  );
}
