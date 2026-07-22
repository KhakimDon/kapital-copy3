import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Company = {
  id: number;
  name: string;
  inn?: string;
  chat2_company_id?: string;
};

// Пилот P26015: mini-app работает в контексте ровно одной компании —
// она захардкожена и выбрана всегда (экранов «выберите компанию» нет).
export const PILOT_COMPANY: Company = {
  id: 1,
  name: 'OOO "BARAKA SAVDO"',
  inn: "305123456",
};

type CompanyState = {
  current: Company | null;
  setCurrent: (c: Company | null) => void;
};

export const useCompany = create<CompanyState>()(
  persist(
    (set) => ({
      current: PILOT_COMPANY,
      // Сброс в null невозможен — компания фиксированная.
      setCurrent: (c) => set({ current: c ?? PILOT_COMPANY }),
    }),
    {
      name: "aiba.company",
      // Старое персистентное состояние могло хранить null или другую
      // компанию — всегда приводим к компании пилота.
      merge: (_persisted, current) => ({ ...current, current: PILOT_COMPANY }),
    }
  )
);
