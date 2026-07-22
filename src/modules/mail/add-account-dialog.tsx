// Add-account wizard: pick a provider tile → enter email + app password (or, for
// "generic", custom IMAP/SMTP host+port). The backend verifies the IMAP login
// before the account is saved, so a bad password surfaces here immediately.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AtSign, Loader2, Plus } from "lucide-react";
import type { AxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAddAccount, useProviders, type MailAccount, type MailProvider } from "./api";
import { GmailIcon, ICloudIcon, MailRuIcon, YandexIcon } from "./provider-icons";

const BRAND: Record<string, React.FC<{ className?: string }>> = {
  yandex: YandexIcon,
  mailru: MailRuIcon,
  icloud: ICloudIcon,
  gmail: GmailIcon,
};

/** Official brand mark on a white chip; unknown/generic → a gray "@" circle. */
function ProviderBadge({ id }: { id: string }) {
  const Icon = BRAND[id];
  if (!Icon) {
    return (
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-neutral-500 text-white">
        <AtSign className="size-5" />
      </span>
    );
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white">
      <Icon className="size-6" />
    </span>
  );
}

export function AddAccountDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (a: MailAccount) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.mail.${k}`, { defaultValue: d });
  const { data: providers = [] } = useProviders();
  const add = useAddAccount();

  const [picked, setPicked] = useState<MailProvider | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPicked(null);
    setEmail("");
    setPassword("");
    setImapHost("");
    setImapPort("993");
    setSmtpHost("");
    setSmtpPort("587");
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pick = (p: MailProvider) => {
    setPicked(p);
    setError(null);
    if (p.custom) {
      setImapPort(String(p.imapPort));
      setSmtpPort(String(p.smtpPort));
    }
  };

  const submit = async () => {
    if (!picked) return;
    setError(null);
    try {
      const acc = await add.mutateAsync({
        provider: picked.id,
        email: email.trim(),
        password,
        imapHost: picked.custom ? imapHost.trim() : undefined,
        imapPort: picked.custom ? Number(imapPort) : undefined,
        smtpHost: picked.custom ? smtpHost.trim() : undefined,
        smtpPort: picked.custom ? Number(smtpPort) : undefined,
      });
      onAdded?.(acc);
      close();
    } catch (e) {
      const ax = e as AxiosError<{ detail?: string }>;
      setError(ax.response?.data?.detail || tr("addFailed", "Ulanib bo'lmadi. Ma'lumotlarni tekshiring."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[32rem] max-w-[95vw] p-0">
        {!picked ? (
          <div className="p-5">
            <h2 className="text-base font-semibold">{tr("addAccount", "Pochta qo'shish")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("pickProvider", "Provayderni tanlang")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted"
                >
                  <ProviderBadge id={p.id} />
                  <span className="text-sm font-medium">{p.custom ? tr("otherImap", "Boshqa (IMAP)") : p.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setPicked(null); setError(null); }}
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label={tr("back", "Orqaga")}
              >
                <ArrowLeft className="size-4" />
              </button>
              <h2 className="text-base font-semibold">{picked.custom ? tr("otherImap", "Boshqa (IMAP)") : picked.label}</h2>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <Field label={tr("email", "Email")}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
              </Field>
              <Field label={tr("appPassword", "Ilova paroli")}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" />
              </Field>

              {picked.custom && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="IMAP host">
                    <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.example.com" />
                  </Field>
                  <Field label="IMAP port">
                    <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
                  </Field>
                  <Field label="SMTP host">
                    <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
                  </Field>
                  <Field label="SMTP port">
                    <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                  </Field>
                </div>
              )}

              {(picked.custom ? tr("otherImapHint", "Provayderingizning IMAP/SMTP host va portini kiriting") : picked.hint) && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  💡 {picked.custom ? tr("otherImapHint", "Provayderingizning IMAP/SMTP host va portini kiriting") : picked.hint}
                </p>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={close}>{tr("cancel", "Bekor qilish")}</Button>
              <Button className="gap-2" onClick={submit} disabled={add.isPending || !email.trim() || !password}>
                {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {tr("connect", "Ulash")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
