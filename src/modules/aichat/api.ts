/**
 * AI Yordamchi (aichat) hooks + SSE streaming helper.
 *
 * Reads come from /api/v2/aichat (backend reads nc_uic.oc_aiba_ai_chats +
 * oc_aiba_ai_chat_msgs). Sends are proxied to the AIBA backend (settings
 * .aiba_backend_url, default https://api.aiba.uz) where the LLM + tools live.
 *
 * SSE protocol (mirrors cloud aiba_integration/lib/Controller/AiChatController):
 *   event: start    data: {chat_id}
 *   event: status   data: {tool, message}     -- tool progress (loader text)
 *   event: delta    data: {content, chat_id}  -- assistant text chunks
 *   event: widget   data: {type, data}        -- structured tool results
 *   event: end      data: {chat_id}
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuth } from "@/shared/store/auth";

// --- public types -----------------------------------------------------------

export type ChatRow = {
  id: number;
  name: string;
  company_id: string | null;
  user_id?: string | null;
  created_at: number;
  updated_at: number;
};

export type MessageRow = {
  id: number;
  role: "user" | "assistant" | "tool" | "system" | "widget";
  content: string;
  widget_type: string | null;
  widget_json: unknown | null;
  created_at: number;
};

// --- queries ----------------------------------------------------------------

const BASE = "/aichat";

export function useChats() {
  return useQuery<{ items: ChatRow[] }>({
    queryKey: ["aichat", "chats"],
    queryFn: async () => (await api.get(`${BASE}/chats`)).data,
    staleTime: 15_000,
  });
}

export function useChatMessages(chatId: number | null) {
  return useQuery<{ items: MessageRow[] }>({
    queryKey: ["aichat", "messages", chatId],
    queryFn: async () => (await api.get(`${BASE}/chats/${chatId}/messages`)).data,
    enabled: !!chatId,
    staleTime: 5_000,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation<ChatRow, Error, { name?: string; company_id?: string | null }>({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/chats`, body || {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aichat", "chats"] }),
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (chatId) => {
      await api.delete(`${BASE}/chats/${chatId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aichat", "chats"] }),
  });
}

export function useRenameChat() {
  const qc = useQueryClient();
  return useMutation<void, Error, { chatId: number; name: string }>({
    mutationFn: async ({ chatId, name }) => {
      await api.patch(`${BASE}/chats/${chatId}`, { name });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aichat", "chats"] }),
  });
}

// --- SSE streaming ----------------------------------------------------------

export type StreamHandlers = {
  onStart?: (chatId: number) => void;
  onDelta?: (text: string) => void;            // incremental assistant text
  onStatus?: (tool: string, message: string) => void;
  onWidget?: (type: string, data: unknown) => void;
  onEnd?: (chatId: number) => void;
  onError?: (err: Error) => void;
};

export type StreamPayload = {
  chat_id?: number | null;
  // Backend's SendMessageRequest.content (min_length=1). Keep the name in sync
  // with backend/app/modules/aichat/schemas.py — mismatched names → 422.
  content: string;
  company_id?: string | number | null;
  history?: { role: "user" | "assistant"; content: string }[];
};

/**
 * Open a POST /aichat/message/stream SSE stream. Returns an AbortController
 * the caller can use to cancel mid-stream (Stop button). The Promise resolves
 * once the stream ends naturally — errors call onError + reject.
 */
export async function streamMessage(
  payload: StreamPayload,
  handlers: StreamHandlers,
): Promise<{ ctrl: AbortController; done: Promise<void> }> {
  const ctrl = new AbortController();
  const { token } = useAuth.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) headers["X-AIBA-Token"] = token;

  const done = (async () => {
    let res: Response;
    try {
      res = await fetch(`/api/v2${BASE}/message/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      handlers.onError?.(e as Error);
      throw e;
    }

    if (!res.ok || !res.body) {
      // Read body to surface the validation/error detail (eg. FastAPI 422).
      let detail = "";
      try {
        const t = await res.text();
        const j = JSON.parse(t);
        detail = typeof j?.detail === "string"
          ? j.detail
          : Array.isArray(j?.detail)
            ? j.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
            : t.slice(0, 200);
      } catch { /* keep empty */ }
      const err = new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
      handlers.onError?.(err);
      throw err;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let curEvent = "";
    let endedChatId = 0;

    try {
      while (true) {
        const { value, done: rdDone } = await reader.read();
        if (rdDone) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || ""; // keep trailing partial line for next chunk
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) {
            // blank line = event delimiter; we already parsed individual lines
            continue;
          }
          if (line.startsWith("event:")) {
            curEvent = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            const json = line.slice(5).trim();
            if (!json) continue;
            let payloadObj: Record<string, unknown>;
            try {
              payloadObj = JSON.parse(json) as Record<string, unknown>;
            } catch {
              // Treat bad JSON as raw text (rare; defensive)
              handlers.onDelta?.(json);
              curEvent = "";
              continue;
            }
            switch (curEvent) {
              case "start": {
                const cid = Number(payloadObj.chat_id ?? 0);
                if (cid) handlers.onStart?.(cid);
                break;
              }
              case "status": {
                handlers.onStatus?.(
                  String(payloadObj.tool ?? ""),
                  String(payloadObj.message ?? ""),
                );
                break;
              }
              case "widget": {
                const t = payloadObj.type;
                if (t) {
                  handlers.onWidget?.(String(t), payloadObj.data ?? {});
                }
                break;
              }
              case "delta":
              case "":
              default: {
                const cid = Number(payloadObj.chat_id ?? 0);
                if (cid && !endedChatId) endedChatId = cid;
                const text = String(payloadObj.content ?? "");
                if (text) handlers.onDelta?.(text);
                break;
              }
              case "end": {
                endedChatId = Number(payloadObj.chat_id ?? endedChatId);
                break;
              }
            }
            curEvent = "";
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      handlers.onError?.(e as Error);
      throw e;
    } finally {
      handlers.onEnd?.(endedChatId);
    }
  })();

  return { ctrl, done };
}

// --- small helpers ----------------------------------------------------------

/** "5 daqiqa oldin" / "Bugun" / "Kecha" / "2025-12-04" — Uzbek relative time. */
export function relativeTimeUz(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - unixSeconds);
  if (diff < 60) return "Hozir";
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  // Today vs yesterday by local date
  const d = new Date(unixSeconds * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `Bugun ${hh}:${mm}`;
  }
  if (sameDay(d, yesterday)) return "Kecha";
  return d.toLocaleDateString("ru-RU");
}
