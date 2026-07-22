import { useTranslation } from "react-i18next";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DocRow } from "./types";
import oneCGreen from "./img/1c-green.png";
import oneCYellow from "./img/1c-yellow.png";
import oneCGray from "./img/1c-gray.png";
import oneCPurple from "./img/1c-purple.png";

/**
 * 1C integration icon — ported 1:1 from the cloud `docs-1c-icon`. The colour
 * reflects the 1C posting state:
 *   green  = posted in 1C            yellow = not posted
 *   purple = AI autoposting          gray   = unknown
 *
 * The "does this doc exist in 1C?" signal comes from the 1C connector
 * (aiba_rdp exists-cache), which the PoC does not wire yet — so `resolveState`
 * returns "gray". The hook is left in place for when 1C is added.
 */
const STATES = {
  green: { src: oneCGreen, tipKey: "modules.documents.onec.green" },
  yellow: { src: oneCYellow, tipKey: "modules.documents.onec.yellow" },
  purple: { src: oneCPurple, tipKey: "modules.documents.onec.purple" },
  gray: { src: oneCGray, tipKey: "modules.documents.onec.gray" },
} as const;

export type OneCState = keyof typeof STATES;

function resolveState(row: DocRow): OneCState {
  // No backend signal in the PoC → always "unknown". Hook left for future wiring.
  void row;
  return "gray";
}

export function OneCStatusIcon({ row, state }: { row?: DocRow; state?: OneCState }) {
  const { t } = useTranslation();
  const s = state ?? (row ? resolveState(row) : "gray");
  const st = STATES[s];
  const tip = t(st.tipKey);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex" aria-label={tip}>
            <img src={st.src} alt="1C" className="size-6 shrink-0 object-contain" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
