/**
 * Shared building blocks for the KM admin full-page forms
 * (company-form-page, user-form-page). Keeps both pages visually consistent:
 * a back header, card sections, and a labelled field grid.
 */
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FormPageHeader({
  title, subtitle, onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3">
      <Button variant="ghost" size="icon" onClick={onBack} title="←">
        <ArrowLeft className="size-5" />
      </Button>
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>
      </CardContent>
    </Card>
  );
}

export function Field({
  label, required, full, children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function FormFooter({
  onCancel, onSave, saving, cancelLabel, saveLabel, disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  cancelLabel: string;
  saveLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 border-t border-border">
      <Button variant="outline" onClick={onCancel} disabled={saving}>{cancelLabel}</Button>
      <Button onClick={onSave} disabled={saving || disabled}>
        {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
        {saveLabel}
      </Button>
    </div>
  );
}

export function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
      {text}
    </div>
  );
}
