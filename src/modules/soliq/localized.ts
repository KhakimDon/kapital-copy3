/**
 * Soliq upstream (soliq.uz internal API) returns many "name" fields as a
 * multi-lang object — `{ name_en, name_ru, name_uz_cyrl, name_uz_latn }` —
 * rather than a plain string. Rendering the object directly triggers
 * React error #31 ("Objects are not valid as a React child") and blanks
 * the whole tab.
 *
 * This helper coerces either shape to a single string, preferring Uzbek
 * Latin, then Russian, then any other populated key.
 */
export type MaybeLocalized =
  | string
  | null
  | undefined
  | {
      name_en?: string | null;
      name_ru?: string | null;
      name_uz_cyrl?: string | null;
      name_uz_latn?: string | null;
      ru?: string | null;
      en?: string | null;
      [k: string]: string | null | undefined;
    };

export function localized(v: MaybeLocalized): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v || undefined;
  return (
    v.name_uz_latn ||
    v.name_ru ||
    v.ru ||
    v.name_uz_cyrl ||
    v.name_en ||
    v.en ||
    Object.values(v).find((s): s is string => !!s && typeof s === "string") ||
    undefined
  );
}
