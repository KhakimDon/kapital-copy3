// The `/documents/.../bank-transactions` endpoint returns a human-readable
// Uzbek `reason` string (the backend is a parity-locked 1:1 port, so it can't
// hand back a stable code). Map the known reasons to i18n keys here so ru/en/
// uz_Cyrl localize; any unrecognised reason falls through verbatim.
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const REASON_KEYS: Record<string, string> = {
  "Kontragent STIR aniqlanmadi": "noTin",
  "Kompaniya bank bilan bog'lanmagan": "noBankLink",
  "Tranzaksiyalarni yuklab bo'lmadi": "loadFailed",
};

/** Localize a bank-transactions `reason`, or null when there is none. */
export function bankReasonText(reason: string | null | undefined, t: TFn): string | null {
  if (!reason) return null;
  const key = REASON_KEYS[reason];
  return key ? t(`modules.documents.bank.reason.${key}`, { defaultValue: reason }) : reason;
}
