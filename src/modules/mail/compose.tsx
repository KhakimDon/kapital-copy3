// Compose dialog — sends through the selected account's SMTP via the backend
// (`POST /mail/send`), which also files a copy in the account's Sent folder.
// Body is a small WYSIWYG editor (see ./editor) → HTML, with a plain-text
// alternative derived for the multipart message.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send } from "lucide-react";
import type { AxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSendMail, type MailAccount } from "./api";
import { RichTextEditor } from "./editor";
import { mailToast } from "./toast";

export type ComposeSeed = {
  accountId?: string;
  to?: string;
  subject?: string;
  quote?: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlToText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  } catch {
    return html.replace(/<[^>]+>/g, "");
  }
}

export function ComposeDialog({
  open,
  onClose,
  accounts,
  defaultAccountId,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  accounts: MailAccount[];
  defaultAccountId: string;
  seed?: ComposeSeed | null;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.mail.${k}`, { defaultValue: d });
  const sendMail = useSendMail();

  const [accountId, setAccountId] = useState(defaultAccountId);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState(0); // bumps on open → remounts the editor
  const bodyHtmlRef = useRef("");

  const initialHtml = useMemo(
    () => (seed?.quote ? `<br><br><br>—<br>${escapeHtml(seed.quote).replace(/\n/g, "<br>")}` : ""),
    [seed],
  );

  useEffect(() => {
    if (open) {
      setAccountId(seed?.accountId || defaultAccountId);
      setTo(seed?.to || "");
      setSubject(seed?.subject || "");
      bodyHtmlRef.current = initialHtml;
      setError(null);
      setOpenId((x) => x + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!accountId) {
      setError(tr("noAccount", "Yuborish uchun hisob tanlang"));
      return;
    }
    if (!to.trim()) {
      setError(tr("noRecipient", "Qabul qiluvchini kiriting"));
      return;
    }
    setError(null);
    const html = bodyHtmlRef.current;
    const text = htmlToText(html);
    try {
      await sendMail.mutateAsync({ accountId, to, subject, bodyText: text, bodyHtml: html || undefined });
      mailToast(tr("sentOk", "Xabar yuborildi"));
      onClose();
    } catch (e) {
      const ax = e as AxiosError<{ detail?: string }>;
      setError(ax.response?.data?.detail || tr("sendFailed", "Yuborib bo'lmadi"));
    }
  };

  const fromAccount = accounts.find((a) => a.id === accountId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[42rem] max-w-[95vw] flex-col gap-0 p-0">
        {/* DialogContent already renders a close (X) at top-right — don't add a
            second one here. */}
        <div className="flex items-center justify-between border-b px-4 py-3 pr-12">
          <span className="text-sm font-semibold">{tr("newMessage", "Yangi xat")}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
          {/* From account */}
          <label className="flex items-center gap-3 border-b pb-2">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">{tr("from", "Kimdan")}</span>
            {accounts.length > 1 ? (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-8 flex-1 bg-transparent text-sm outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm">{fromAccount?.email || "—"}</span>
            )}
          </label>
          <label className="flex items-center gap-3 border-b pb-2">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">{tr("to", "Kimga")}</span>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@example.uz"
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </label>
          <label className="flex items-center gap-3 border-b pb-2">
            <span className="w-16 shrink-0 text-sm text-muted-foreground">{tr("subject", "Mavzu")}</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={tr("subject", "Mavzu")}
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </label>
          <RichTextEditor
            key={openId}
            html={initialHtml}
            onChange={(h) => {
              bodyHtmlRef.current = h;
            }}
            placeholder={tr("bodyPh", "Xabaringizni yozing…")}
            className="min-h-0 flex-1"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            {tr("cancel", "Bekor qilish")}
          </Button>
          <Button className="gap-2" onClick={submit} disabled={sendMail.isPending}>
            {sendMail.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {tr("send", "Yuborish")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
