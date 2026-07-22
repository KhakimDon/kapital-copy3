// Telegram notifications setup inside Project settings (Jira "Telegram
// Connector" model): pick a registered bot, give the group chat id (the bot
// must already be IN that group), choose events. Bots themselves are managed
// here too — but only by tenant admins (token → validated via getMe).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/shared/api/me";
import {
  type TelegramEvents,
  useAddTelegramBot,
  useDeleteTelegramBot,
  useDeleteTelegramConfig,
  useSaveTelegramConfig,
  useTelegramBots,
  useTelegramConfig,
  useTelegramTest,
} from "../telegram-api";

const EVENT_KEYS: (keyof TelegramEvents)[] = [
  "created", "moved", "completed", "assigned", "commented", "updated", "deleted",
];

export function TelegramSection({ companyId, projectId }: { companyId: number; projectId: string }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.tasks.telegram.${k}`, { defaultValue: d });
  const { data: me } = useMe();
  const isAdmin = !!(me?.is_admin || me?.is_superadmin);

  const bots = useTelegramBots();
  const addBot = useAddTelegramBot();
  const delBot = useDeleteTelegramBot();
  const cfg = useTelegramConfig(companyId, projectId);
  const saveCfg = useSaveTelegramConfig(companyId, projectId);
  const delCfg = useDeleteTelegramConfig(companyId, projectId);
  const test = useTelegramTest();

  const [botId, setBotId] = useState("");
  const [chatId, setChatId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [events, setEvents] = useState<TelegramEvents>({});
  const [enabled, setEnabled] = useState(true);
  const [newToken, setNewToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (cfg.data) {
      setBotId(cfg.data.botId);
      setChatId(cfg.data.chatId);
      setThreadId(cfg.data.threadId ?? "");
      setEvents(cfg.data.events ?? {});
      setEnabled(cfg.data.enabled);
    }
  }, [cfg.data]);

  const evOn = (k: keyof TelegramEvents) => events[k] !== false;

  const save = async () => {
    setMsg(null);
    try {
      await saveCfg.mutateAsync({ botId, chatId, threadId: threadId || null, events, enabled });
      setMsg({ ok: true, text: tr("saved", "Saqlandi") });
    } catch (e) {
      setMsg({ ok: false, text: String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? e) });
    }
  };

  const sendTest = async () => {
    setMsg(null);
    try {
      await test.mutateAsync({ botId, chatId, threadId: threadId || null });
      setMsg({ ok: true, text: tr("testOk", "Test xabari yuborildi ✅") });
    } catch (e) {
      setMsg({ ok: false, text: String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? e) });
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Send className="size-4 text-sky-500" />
        <span className="text-sm font-medium">{tr("title", "Telegram xabarnomalar")}</span>
      </div>

      {/* bots — visible to all, managed by tenant admins only */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{tr("bots", "Botlar")}</span>
        {(bots.data ?? []).length === 0 && (
          <div className="text-xs text-muted-foreground">
            {isAdmin
              ? tr("noBotsAdmin", "Hali bot qo'shilmagan — @BotFather'dan token oling va quyida qo'shing.")
              : tr("noBots", "Hali bot qo'shilmagan. Bot tokenini faqat tenant admin qo'sha oladi.")}
          </div>
        )}
        {(bots.data ?? []).map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
            <span className="font-medium">{b.name}</span>
            <span className="text-xs text-muted-foreground">@{b.username}</span>
            <span className="flex-1" />
            {isAdmin && (
              <button
                type="button"
                onClick={() => delBot.mutate(b.id)}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                title={t("common.delete", { defaultValue: "O'chirish" })}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {isAdmin && (
          <div className="flex gap-1.5">
            <Input
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder={tr("tokenPh", "Bot token (@BotFather)")}
              className="h-8 text-xs font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!newToken.trim() || addBot.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  await addBot.mutateAsync({ token: newToken.trim() });
                  setNewToken("");
                } catch (e) {
                  setMsg({ ok: false, text: String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? e) });
                }
              }}
            >
              {addBot.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {/* per-project binding */}
      {(bots.data ?? []).length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{tr("bot", "Bot")}</span>
              <Select value={botId} onValueChange={setBotId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(bots.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>@{b.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{tr("chatId", "Guruh chat ID")}</span>
              <Input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {tr("hint", "Botni guruhga qo'shing, keyin guruh ID sini kiriting (@getidsbot yordam beradi; -100 bilan boshlanadi).")}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {EVENT_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={evOn(k)}
                  onChange={(e) => setEvents((ev) => ({ ...ev, [k]: e.target.checked }))}
                  className="size-3.5 accent-primary"
                />
                {tr(`ev.${k}`, k)}
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              {tr("enabled", "Yoqilgan")}
            </label>
            <div className="flex gap-1.5">
              {cfg.data && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => delCfg.mutate()}>
                  {tr("unbind", "Uzish")}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!botId || !chatId.trim() || test.isPending} onClick={sendTest}>
                {test.isPending ? <Loader2 className="size-3.5 animate-spin" /> : tr("test", "Test")}
              </Button>
              <Button size="sm" className="h-8 text-xs" disabled={!botId || !chatId.trim() || saveCfg.isPending} onClick={save}>
                {saveCfg.isPending ? <Loader2 className="size-3.5 animate-spin" /> : tr("save", "Saqlash")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className={msg.ok ? "text-xs text-emerald-600" : "text-xs text-destructive"}>{msg.text}</div>
      )}
    </div>
  );
}
