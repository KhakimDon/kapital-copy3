// Telegram-style delete confirmation. Telegram never just says "delete?" — it
// distinguishes DELETE FOR ME (drop it from our copy only) from DELETE FOR
// EVERYONE (revoke it for all participants). MTProto models that as the
// `revoke` flag on messages.deleteMessages, which our backend already honours,
// so this dialog simply asks which one the user meant.
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TgDeleteMessageDialog({
  open,
  count = 1,
  /** Offer "delete for everyone" — Telegram only allows revoking your own
   *  messages (or any message when you're an admin). */
  canRevoke = true,
  onCancel,
  onDelete,
}: {
  open: boolean;
  count?: number;
  canRevoke?: boolean;
  onCancel: () => void;
  /** `revoke` = delete for everyone; otherwise only for us. */
  onDelete: (revoke: boolean) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-destructive" />
            {count > 1
              ? tr("deleteMsgsTitle", "Xabarlar o'chirilsinmi?").replace("{{n}}", String(count))
              : tr("deleteMsgTitle", "Xabar o'chirilsinmi?")}
          </DialogTitle>
          <DialogDescription>
            {tr("deleteMsgHint", "Faqat o'zingizdan yoki hammadan o'chirishingiz mumkin.")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {tr("cancel", "Bekor qilish")}
          </Button>
          <Button variant="outline" onClick={() => onDelete(false)}>
            {tr("deleteForMe", "Menda o'chirish")}
          </Button>
          {canRevoke && (
            <Button variant="destructive" onClick={() => onDelete(true)}>
              {tr("deleteForEveryone", "Hammada o'chirish")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
