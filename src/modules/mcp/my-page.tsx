import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plug, Plus, Copy, Check, Trash2, Bot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMyMcpModules, useMyMcpTokens, useCreateMyMcpToken, useRevokeMyMcpToken,
  type IssuedMcpToken,
} from "@/shared/api/mcp";

function fmtWhen(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Self-service MCP: any user connects their own AI client (Claude Desktop/Code)
 *  to the modules exposed for their tenant. Opened from the profile dropdown. */
export function McpMyPage() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, { defaultValue: d });
  const { data: config } = useMyMcpModules();
  const { data: tokens } = useMyMcpTokens();
  const create = useCreateMyMcpToken();
  const revoke = useRevokeMyMcpToken();

  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"read-only" | "read-write">("read-write");
  const [issued, setIssued] = useState<IssuedMcpToken | null>(null);
  const [copied, setCopied] = useState<"" | "token" | "endpoint">("");

  const endpoint = `${window.location.origin}/api/v2/mcp`;
  const enabled = (config?.modules ?? []).filter((m) => m.enabled);

  const copy = (what: "token" | "endpoint", text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    });
  };

  const submit = () => {
    create.mutate(
      { label: label.trim() || tr("mcp.my.defaultLabel", "My connection"), scope },
      { onSuccess: (d) => { setIssued(d); setLabel(""); } },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Plug className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{tr("mcp.my.title", "MCP — connect an AI client")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("mcp.my.subtitle", "Let Claude Desktop/Code work with your AIBA modules. Access can never exceed your own — the board's roles still apply.")}
          </p>
        </div>
      </header>

      {/* Available modules — each with a short "what the AI can do" blurb. */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="size-4" />{tr("mcp.my.modules", "Available modules")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {enabled.length === 0 && <p className="text-sm text-muted-foreground">{tr("mcp.my.none", "No modules are exposed yet.")}</p>}
          {enabled.map((m) => (
            <div key={m.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
              <Badge variant="secondary" className="w-fit shrink-0 gap-1"><Plug className="size-3" />{m.name}</Badge>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tr(`mcp.moduleDesc.${m.key}`, "")}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* How to connect — per-client tabs. The connector URL (token embedded)
          is the whole credential: NO OAuth fields anywhere. */}
      <Card>
        <CardHeader><CardTitle className="text-base">{tr("mcp.howto.title", "Qanday ulash")}</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="claude">
            <TabsList>
              <TabsTrigger value="claude">Claude</TabsTrigger>
              <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
              <TabsTrigger value="gemini">Gemini</TabsTrigger>
            </TabsList>

            <TabsContent value="claude" className="mt-3 space-y-2 text-sm">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>{tr("mcp.howto.step.token", "Pastda token yarating va chiqqan Connector URL'ni nusxalang.")}</li>
                <li>{tr("mcp.howto.claude.s2", "Claude → Settings → Connectors → Add custom connector.")}</li>
                <li>{tr("mcp.howto.claude.s3", "Name: AIBA; URL maydoniga o'sha havolani qo'ying.")}</li>
                <li>{tr("mcp.howto.claude.s4", "Add bosing — login so'ramasdan ulanadi.")}</li>
              </ol>
              <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
                ⚠️ {tr("mcp.howto.claude.warn", "OAuth Client ID va Client Secret maydonlarini BO'SH qoldiring — token URL ichida bo'ladi. Ularni to'ldirsangiz Claude sizni keraksiz login oynasiga yuboradi.")}
              </div>
            </TabsContent>

            <TabsContent value="chatgpt" className="mt-3 space-y-2 text-sm">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>{tr("mcp.howto.step.token", "Pastda token yarating va chiqqan Connector URL'ni nusxalang.")}</li>
                <li>{tr("mcp.howto.chatgpt.s2", "ChatGPT → Settings → Connectors → Create.")}</li>
                <li>{tr("mcp.howto.chatgpt.s3", "MCP Server URL: o'sha havola; Authentication: None.")}</li>
                <li>{tr("mcp.howto.chatgpt.s4", "Create bosing.")}</li>
              </ol>
            </TabsContent>

            <TabsContent value="gemini" className="mt-3 space-y-2 text-sm">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>{tr("mcp.howto.step.token", "Pastda token yarating va chiqqan Connector URL'ni nusxalang.")}</li>
                <li>{tr("mcp.howto.gemini.s2", "~/.gemini/settings.json fayliga qo'shing:")}</li>
              </ol>
              <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-[12px] leading-relaxed">
{`{
  "mcpServers": {
    "aiba": { "httpUrl": "${endpoint}/t/<TOKEN>" }
  }
}`}
              </pre>
              <p className="text-[13px] text-muted-foreground">{tr("mcp.howto.gemini.s3", "Gemini CLI'ni qayta ishga tushiring — tool'lar ro'yxatda paydo bo'ladi.")}</p>
            </TabsContent>
          </Tabs>

          {/* Bare endpoint for header-capable clients */}
          <div className="mt-4 flex items-center gap-2 border-t pt-3">
            <span className="shrink-0 text-xs text-muted-foreground">{tr("mcp.connect", "Endpoint")}:</span>
            <code className="flex-1 truncate rounded-md bg-muted px-3 py-1.5 text-xs">{endpoint}</code>
            <Button variant="ghost" size="sm" onClick={() => copy("endpoint", endpoint)}>
              {copied === "endpoint" ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Personal tokens */}
      <Card>
        <CardHeader><CardTitle className="text-base">{tr("mcp.my.tokens", "Your connection tokens")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input placeholder={tr("mcp.my.labelPh", "Name this connection (e.g. My laptop)")} value={label} onChange={(e) => setLabel(e.target.value)} />
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read-write">{tr("mcp.readWrite", "Read-write")}</SelectItem>
                <SelectItem value="read-only">{tr("mcp.readOnly", "Read-only")}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={submit} disabled={create.isPending || enabled.length === 0}>
              <Plus className="size-4 mr-1" />{tr("mcp.my.generate", "Generate")}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("mcp.tokenLabel", "Label")}</TableHead>
                <TableHead>{tr("mcp.scope", "Scope")}</TableHead>
                <TableHead>{tr("mcp.created", "Created")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tokens ?? []).map((tk) => {
                const revoked = !!tk.revokedAt;
                const sc = tk.scopes?.modules?.[0]?.scope ?? "—";
                return (
                  <TableRow key={tk.id} className={revoked ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{tk.label || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{sc}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtWhen(tk.createdAt)}</TableCell>
                    <TableCell>
                      {revoked ? (
                        <Badge variant="secondary">{tr("mcp.revoked", "revoked")}</Badge>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => revoke.mutate(tk.id)} title={tr("mcp.revoke", "Revoke")}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(tokens ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">{tr("mcp.my.noTokens", "No tokens yet — generate one to connect.")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Plaintext token dialog — shown once. */}
      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("mcp.my.issued", "Your connection")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tr("mcp.tokenOnce", "Copy this now — it is shown only once. Only a hash is stored.")}</p>

          {/* The ready-to-paste connector URL (token embedded) — what Claude's
              custom-connector dialog accepts, since it can't send auth headers. */}
          <div className="space-y-1">
            <div className="text-xs font-medium">{tr("mcp.my.connectorUrl", "Connector URL — paste into Claude (Settings → Connectors → Add custom connector)")}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">{issued ? `${endpoint}/t/${issued.token}` : ""}</code>
              <Button variant="outline" size="sm" onClick={() => issued && copy("token", `${endpoint}/t/${issued.token}`)}>
                {copied === "token" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{tr("mcp.my.rawToken", "Raw token (for clients that support an Authorization: Bearer header)")}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">{issued?.token}</code>
              <Button variant="ghost" size="sm" onClick={() => issued && copy("endpoint", issued.token)}>
                {copied === "endpoint" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {tr("mcp.my.urlWarn", "The URL contains your token — treat it like a password. Revoking the token disables the URL.")}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
