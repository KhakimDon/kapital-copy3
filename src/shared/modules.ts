import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export type ModuleState = "native" | "proxy" | "placeholder";

export type Module = {
  slug: string;
  title: string;
  icon: string;          // lucide icon name
  state: ModuleState;
  description?: string;
};

export function useModules() {
  return useQuery<Module[]>({
    queryKey: ["modules"],
    queryFn: async () => (await api.get<Module[]>("/modules")).data,
    staleTime: 5 * 60_000,
  });
}
