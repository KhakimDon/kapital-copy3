import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plug, Plus, Copy, Check, Trash2, ShieldCheck, ScrollText, KeyRound } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useMcpConfig, useSetMcpModule, useMcpTokens, useCreateMcpToken, useRevokeMcpToken,
  useMcpAudit, useMcpGrants, useSetMcpGrants,
  type IssuedMcpToken, type McpModuleGrant,
} from "@/shared/api/mcp";

function fmtWhen(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Tenant-admin MCP setup: enable modules, issue/revoke tokens, cap grants,
 *  read the audit log. Rendered inside the settings rail (km-admin). */
export function McpAdminPage() {
  const { t } = useTranslation();
  const tr = (k: string, dflt: string) => t(k, { defaultValue: dflt });
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="flex items-center gap-2">
        <Plug className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{tr("modules.mcp.title", "MCP Server")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("modules.mcp.subtitle", "Expose modules to AI clients (Claude Desktop/Code + AIBA AI) — governed and audited.")}
          </p>
        </div>
      </header>

      <ModulesCard tr={tr} />
      <ConnectCard tr={tr} />
      <TokensCard tr={tr} />
      <GrantsCard tr={tr} />
      <AuditCard tr={tr} />
    </div>
  );
}

function ModulesCard({ tr }: { tr: (k: string, d: string) => string }) {
  const { data } = useMcpConfig();
  const setModule = useSetMcpModule();
  const modules = data?.modules ?? [];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plug className="size-4" />{tr("modules.mcp.modules", "Modules")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {modules.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
        {modules.map((m) => (
          <div key={m.key} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">{m.key}</div>
            </div>
            <Switch
              checked={m.enabled}
              onCheckedChange={(v) => {
                const next = Object.fromEntries(modules.map((x) => [x.key, x.key === m.key ? v : x.enabled]));
                setModule.mutate({ modules: next });
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConnectCard({ tr }: { tr: (k: string, d: string) => string }) {
  const [copied, setCopied] = useState(false);
  const endpoint = `${window.location.origin}/api/v2/mcp`;
  const copy = () => {
    navigator.clipboard.writeText(endpoint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{tr("modules.mcp.connect", "Connect")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {tr("modules.mcp.connectHint", "MCP endpoint (JSON-RPC over HTTP). AIBA's own AI uses your session automatically; external clients authenticate with a token below.")}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">{endpoint}</code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TokensCard({ tr }: { tr: (k: string, d: string) => string }) {
  const { data: tokens } = useMcpTokens();
  const create = useCreateMcpToken();
  const revoke = useRevokeMcpToken();
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [scope, setScope] = useState<"read-only" | "read-write">("read-write");
  const [issued, setIssued] = useState<IssuedMcpToken | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = () => {
    if (!label.trim()) return;
    create.mutate(
      { label: label.trim(), username: username.trim() || undefined, module: "tasks", scope },
      { onSuccess: (d) => { setIssued(d); setLabel(""); setUsername(""); } },
    );
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="size-4" />{tr("modules.mcp.tokens", "Connection tokens")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Input placeholder={tr("modules.mcp.tokenLabel", "Label (e.g. My Desktop)")} value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder={tr("modules.mcp.tokenUser", "User (default: you)")} value={username} onChange={(e) => setUsername(e.target.value)} />
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="read-write">{tr("modules.mcp.readWrite", "Read-write")}</SelectItem>
              <SelectItem value="read-only">{tr("modules.mcp.readOnly", "Read-only")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={submit} disabled={create.isPending || !label.trim()}>
            <Plus className="size-4 mr-1" />{tr("modules.mcp.issue", "Issue")}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("modules.mcp.tokenLabel", "Label")}</TableHead>
              <TableHead>{tr("modules.mcp.tokenUser", "User")}</TableHead>
              <TableHead>{tr("modules.mcp.scope", "Scope")}</TableHead>
              <TableHead>{tr("common.created", "Created")}</TableHead>
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
                  <TableCell>{tk.username}</TableCell>
                  <TableCell><Badge variant="outline">{sc}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtWhen(tk.createdAt)}</TableCell>
                  <TableCell>
                    {revoked ? (
                      <Badge variant="secondary">{tr("modules.mcp.revoked", "revoked")}</Badge>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => revoke.mutate(tk.id)} title={tr("modules.mcp.revoke", "Revoke")}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {(tokens ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">—</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Plaintext token, shown exactly once. */}
      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("modules.mcp.tokenIssued", "Token issued")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {tr("modules.mcp.tokenOnce", "Copy this now — it is shown only once. Only a hash is stored.")}
          </p>
          <div className="space-y-1">
            <div className="text-xs font-medium">{tr("mcp.my.connectorUrl", "Connector URL — paste into Claude (Settings → Connectors → Add custom connector)")}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm">{issued ? `${window.location.origin}/api/v2/mcp/t/${issued.token}` : ""}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (issued) navigator.clipboard.writeText(`${window.location.origin}/api/v2/mcp/t/${issued.token}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{tr("mcp.my.rawToken", "Raw token (for clients that support an Authorization: Bearer header)")}</div>
            <code className="block truncate rounded-md bg-muted px-3 py-2 text-xs">{issued?.token}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("mcp.my.urlWarn", "The URL contains your token — treat it like a password. Revoking the token disables the URL.")}
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function GrantsCard({ tr }: { tr: (k: string, d: string) => string }) {
  const [username, setUsername] = useState("");
  const [query, setQuery] = useState("");
  const { data } = useMcpGrants(query);
  const save = useSetMcpGrants();
  const grant: McpModuleGrant | undefined = data?.grants?.modules?.find((m) => m.module === "tasks");
  const scope = grant?.scope ?? "read-write";

  const setScope = (next: "read-only" | "read-write") => {
    if (!query) return;
    save.mutate({ username: query, grants: { modules: [{ module: "tasks", scope: next, deny_tools: grant?.deny_tools ?? [] }] } });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="size-4" />{tr("modules.mcp.grants", "Per-user grants")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {tr("modules.mcp.grantsHint", "Cap what a specific user's MCP access can do. Default is read-write to enabled modules; the board's own roles still apply.")}
        </p>
        <div className="flex items-center gap-2">
          <Input placeholder={tr("modules.mcp.lookupUser", "Username")} value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery(username.trim())} />
          <Button variant="outline" onClick={() => setQuery(username.trim())}>{tr("common.load", "Load")}</Button>
        </div>
        {query && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="font-medium">{query} — tasks</div>
              <div className="text-xs text-muted-foreground">
                {data?.hasOverride ? tr("modules.mcp.override", "override set") : tr("modules.mcp.default", "default (no override)")}
              </div>
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as "read-only" | "read-write")}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read-write">{tr("modules.mcp.readWrite", "Read-write")}</SelectItem>
                <SelectItem value="read-only">{tr("modules.mcp.readOnly", "Read-only")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditCard({ tr }: { tr: (k: string, d: string) => string }) {
  const { data: rows } = useMcpAudit(100);
  const toneOf = (s: string | null) =>
    s === "ok" ? "outline" : s === "denied" ? "secondary" : "destructive";
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScrollText className="size-4" />{tr("modules.mcp.audit", "Audit log")}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("modules.mcp.when", "When")}</TableHead>
              <TableHead>{tr("modules.mcp.principal", "Principal")}</TableHead>
              <TableHead>{tr("modules.mcp.tool", "Tool")}</TableHead>
              <TableHead>{tr("modules.mcp.status", "Status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtWhen(r.createdAt)}</TableCell>
                <TableCell className="text-sm">{r.principal ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.tool ?? "—"}</TableCell>
                <TableCell><Badge variant={toneOf(r.status)}>{r.status ?? "—"}</Badge></TableCell>
              </TableRow>
            ))}
            {(rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">—</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
