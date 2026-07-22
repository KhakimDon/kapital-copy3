import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Phone, MapPin, User, UserCog, Hash, BadgeCheck, Landmark, Fingerprint,
} from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useTinLookup } from "./api";
import type { DocRow } from "./types";

function Field({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: React.ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="break-words text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

/** Counterparty profile card — pulls the party record by TIN (director,
 *  address, OKED, VAT status, …). Rendered only inside an open popover, so the
 *  lookup fires on demand rather than for every row. */
function CounterpartyProfile({
  companyId, tin, name, phone,
}: {
  companyId: number | null;
  tin?: string | null;
  name?: string | null;
  phone?: string | null;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useTinLookup(companyId, tin ?? "");
  const loading = !!tin && tin.length >= 9 && isPending;

  return (
    <div>
      <div className="border-b border-border pb-2">
        <div className="text-sm font-semibold leading-tight text-foreground">{name ?? data?.name ?? "—"}</div>
        {tin && (
          <div className="mt-0.5 tabular-nums text-xs text-muted-foreground">
            {t("modules.documents.columns.tin")}: {tin}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 py-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          <Field icon={Phone} label={t("modules.documents.columns.phone")} value={phone || undefined} />
          <Field icon={MapPin} label={t("modules.documents.party.address", { defaultValue: "Адрес" })} value={data?.address} />
          <Field icon={User} label={t("modules.documents.party.director", { defaultValue: "Директор" })} value={data?.director} />
          <Field icon={UserCog} label={t("modules.documents.party.accountant", { defaultValue: "Бухгалтер" })} value={data?.accountant} />
          <Field icon={Hash} label="ОКЭД" value={data?.oked} />
          <Field
            icon={BadgeCheck}
            label={t("modules.documents.party.vat", { defaultValue: "НДС" })}
            value={
              data?.vat_reg_code
                ? `${data.vat_reg_code}${data.vat_reg_status ? ` · ${data.vat_reg_status}` : ""}`
                : undefined
            }
          />
          <Field icon={Landmark} label={t("modules.documents.party.account", { defaultValue: "Счёт" })} value={data?.account} />
          <Field icon={Fingerprint} label="ПИНФЛ" value={data?.pinfl} />
          {!isPending && tin && data && data.found === false && (
            <div className="py-2 text-xs text-muted-foreground">
              {t("modules.documents.party.notFound", { defaultValue: "Данные не найдены" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The counterparty table cell: left-click still opens the document (row nav),
 *  right-click opens the counterparty profile popover instead of the row menu. */
export function CounterpartyCell({
  d, companyId, tinNode,
}: {
  d: DocRow;
  companyId: number | null;
  tinNode?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        >
          <div className="font-medium truncate max-w-[240px]">{d.partner_name ?? "—"}</div>
          {tinNode}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <CounterpartyProfile companyId={companyId} tin={d.partner_tin} name={d.partner_name} phone={d.partner_phone} />
      </PopoverContent>
    </Popover>
  );
}
