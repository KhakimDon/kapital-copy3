import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { useMe, useSetAvatar } from "@/shared/api/me";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { AvatarCropDialog } from "@/components/ui/avatar-crop";

export function MePage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useMe();
  const setAvatar = useSetAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const initials = (data?.username ?? "?").slice(0, 2).toUpperCase();

  if (error) return <p className="text-destructive">{t("common.error")}: {String(error)}</p>;

  return (
    <Reveal
      loading={isLoading}
      skeleton={
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t("me.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between border-b py-1 last:border-b-0">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>
      }
    >
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{t("me.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* avatar — square-cropped thumbnail; the original is never uploaded */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {data?.avatar ? (
                <img src={data.avatar} alt="" className="size-20 rounded-full object-cover ring-2 ring-border" />
              ) : (
                <span className="grid size-20 place-items-center rounded-full bg-primary/10 text-xl font-semibold text-primary ring-2 ring-border">{initials}</span>
              )}
              {setAvatar.isPending && (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-background/60"><Loader2 className="size-5 animate-spin" /></span>
              )}
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                <Camera className="size-3.5" /> {t("me.avatarUpload", { defaultValue: "Rasm yuklash" })}
              </button>
              {data?.avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar.mutate(null)}
                  className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> {t("common.delete", { defaultValue: "O'chirish" })}
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">{t("me.avatarHint", { defaultValue: "O'zingiz qirqasiz, originali saqlanmaydi." })}</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setCropFile(f);
              }}
            />
          </div>

          <AvatarCropDialog
            file={cropFile}
            onCancel={() => setCropFile(null)}
            onConfirm={(dataUrl) => {
              setAvatar.mutate(dataUrl);
              setCropFile(null);
            }}
          />

          <div className="space-y-2">
            <Row k="Username" v={data?.username} />
            <Row k="UUID" v={data?.user_id ?? "—"} />
            <Row k={t("me.phone")} v={data?.phone ?? "—"} />
            <Row k={t("me.admin")} v={data?.is_admin ? "Yes" : "No"} />
          </div>
        </CardContent>
      </Card>
    </Reveal>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1 last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
