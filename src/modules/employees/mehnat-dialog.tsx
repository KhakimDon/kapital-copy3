// my.mehnat.uz connect dialog — NC parity with the cloud creds modal:
// company TIN comes from the picker, the certificate list from the company's
// ESKey records (connector_certificate_id), OneID login/password typed in.
// Submit probes /sync/connect-mehnat BEFORE caching, so bad creds are never
// saved and the "connected" chip only appears after a real handshake.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import { api } from "@/shared/api/client";
import { useCompanyKeys } from "@/modules/keys/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type MehnatCreds, lastMehnatCert, lastMehnatLogin, saveMehnatCreds,
} from "./mehnat";

export function MehnatConnectDialog({
  open, onOpenChange, companyId, companyName, companyInn, onConnected,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: number;
  companyName: string;
  companyInn: string;
  onConnected: (creds: MehnatCreds, departments: number) => void;
}) {
  const { t } = useTranslation();
  const { data: keys, isLoading: keysLoading } = useCompanyKeys(open ? companyId : null);
  const [certId, setCertId] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setPassword("");
    setLogin(lastMehnatLogin());
    setCertId("");  // re-picked from the fresh key list below
  }, [open, companyId]);

  // The certificate is picked silently: last-used one if still present,
  // otherwise the first usable key. No visible select — the accountant only
  // ever deals with OneID login/password.
  const usableKeys = (keys ?? []).filter((k) => k.connector_certificate_id);
  useEffect(() => {
    if (!open || certId || !usableKeys.length) return;
    const last = lastMehnatCert(companyId);
    const match = usableKeys.find((k) => k.connector_certificate_id === last);
    setCertId((match ?? usableKeys[0]).connector_certificate_id);
  }, [open, certId, usableKeys, companyId]);

  async function submit() {
    setError("");
    if (!certId) { setError(t("modules.employees.mehnat.errors.pickCertificate")); return; }
    if (!login.trim() || !password) { setError(t("modules.employees.mehnat.errors.enterLoginPassword")); return; }
    const creds: MehnatCreds = {
      certificate_id: certId,
      login: login.trim(),
      password,
      company_tin: companyInn,
    };
    setBusy(true);
    try {
      // The first OneID+EDS handshake takes ~10-20s — give it room.
      const { data } = await api.post(
        `/employees/companies/${companyId}/sync/connect-mehnat`, creds,
        { timeout: 180_000 },
      );
      saveMehnatCreds(companyId, creds);
      onConnected(creds, Number(data?.departments ?? 0));
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || t("modules.employees.mehnat.errors.connectFailed");
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> {t("modules.employees.mehnat.connectTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("modules.employees.mehnat.connectBody")}</p>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {companyName}{companyInn ? ` · INN ${companyInn}` : ""}
          </div>
          {!keysLoading && usableKeys.length === 0 && (
            <div className="rounded-md border border-destructive bg-destructive/10 text-destructive text-sm px-3 py-2 animate-in fade-in-0 duration-300">
              {t("modules.employees.mehnat.noCertificates")}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("modules.employees.mehnat.login")}</span>
            <Input value={login} onChange={(e) => setLogin(e.target.value)}
              autoComplete="off" disabled={busy} className="h-9" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("modules.employees.mehnat.password")}</span>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="off" disabled={busy} className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </label>
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}
          <Button onClick={submit} disabled={busy} className="w-full">
            <Link2 className="size-4 mr-1.5" />
            {busy ? t("modules.employees.mehnat.connecting") : t("modules.employees.mehnat.connect")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
