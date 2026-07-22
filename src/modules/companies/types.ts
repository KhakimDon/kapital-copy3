export type CompanyRow = {
  id: number;
  name?: string | null;
  inn?: string | null;
  legal_form?: string | null;
  is_active?: boolean;
  keys_count?: number | null;
  created_at?: string | null;
  chat2_company_id?: string | null;
  director_name?: string | null;
  phone?: string | null;
};

export type EnrichRow = {
  rating?: string | null;
  rating_points?: number | null;
  rating_color?: string | null;
  debt?: number | null;
  advance?: number | null;
};

export type EnrichMap = Record<string, EnrichRow>;
export type CompaniesPageResp = { items: CompanyRow[]; count: number };
