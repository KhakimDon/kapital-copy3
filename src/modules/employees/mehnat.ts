// my.mehnat.uz session credentials — NC parity: cached PER COMPANY in
// sessionStorage (key aiba_mehnat_creds_{companyId}), prompted once per
// browser session, never persisted to disk. The OneID login and the last
// certificate id go to localStorage for convenient re-prompt prefill.

export type MehnatCreds = {
  certificate_id: string;
  login: string;
  password: string;
  company_tin: string;
};

const PREFIX = "aiba_mehnat_creds_";
const LOGIN_KEY = "aiba_mehnat_login";
const CERT_KEY = (companyId: number) => `aiba_mehnat_cert_${companyId}`;

export function getMehnatCreds(companyId: number | null): MehnatCreds | null {
  if (!companyId) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + companyId);
    if (!raw) return null;
    const obj = JSON.parse(raw) as MehnatCreds;
    if (obj?.certificate_id && obj.login && obj.password && obj.company_tin) {
      return obj;
    }
  } catch {
    /* corrupted cache — treat as absent */
  }
  return null;
}

export function saveMehnatCreds(companyId: number, creds: MehnatCreds): void {
  try {
    sessionStorage.setItem(PREFIX + companyId, JSON.stringify(creds));
    localStorage.setItem(LOGIN_KEY, creds.login);
    localStorage.setItem(CERT_KEY(companyId), creds.certificate_id);
  } catch {
    /* storage quota / private mode — creds just won't be cached */
  }
}

export function clearMehnatCreds(companyId: number | null): void {
  if (!companyId) return;
  try {
    sessionStorage.removeItem(PREFIX + companyId);
  } catch {
    /* ignore */
  }
}

export const lastMehnatLogin = (): string => {
  try { return localStorage.getItem(LOGIN_KEY) || ""; } catch { return ""; }
};

export const lastMehnatCert = (companyId: number): string => {
  try { return localStorage.getItem(CERT_KEY(companyId)) || ""; } catch { return ""; }
};
