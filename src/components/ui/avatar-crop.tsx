import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Square viewport the user pans/zooms the picture inside; the circular guide
// shows what will be kept. Output is a centred 256×256 JPEG data-URL.
const S = 288;
const OUT = 256;

/**
 * Visual avatar cropper: drag to reposition, slider/scroll to zoom, a circular
 * mask previews the crop. `onConfirm` receives the cropped image as a data-URL.
 */
export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      setNat(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    setZoom(1);
    setOff({ x: 0, y: 0 });
    const im = new Image();
    im.onload = () => {
      imgRef.current = im;
      setNat({ w: im.naturalWidth, h: im.naturalHeight });
    };
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // "cover" scale fits the shorter side to the viewport; zoom multiplies it.
  const cover = nat ? Math.max(S / nat.w, S / nat.h) : 1;
  const scale = cover * zoom;
  const dispW = nat ? nat.w * scale : S;
  const dispH = nat ? nat.h * scale : S;

  const clamp = (o: { x: number; y: number }) => {
    const mx = Math.max(0, (dispW - S) / 2);
    const my = Math.max(0, (dispH - S) / 2);
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) };
  };

  // Keep the picture covering the viewport after a zoom change.
  useEffect(() => {
    setOff((o) => clamp(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, nat]);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOff(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  };
  const onUp = () => {
    drag.current = null;
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgLeft = S / 2 - dispW / 2 + off.x;
    const imgTop = S / 2 - dispH / 2 + off.y;
    const srcSize = S / scale;
    ctx.drawImage(img, -imgLeft / scale, -imgTop / scale, srcSize, srcSize, 0, 0, OUT, OUT);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("me.avatarCrop", { defaultValue: "Rasmni qirqish" })}</DialogTitle>
        </DialogHeader>

        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-xl bg-muted active:cursor-grabbing"
          style={{ width: S, height: S }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => setZoom((z) => Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.08 : 0.93))))}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: dispW, height: dispH, left: S / 2 - dispW / 2 + off.x, top: S / 2 - dispH / 2 + off.y }}
            />
          )}
          {/* circular guide — darkens everything outside the crop circle */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/70"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
          />
        </div>

        <div className="flex items-center gap-2 px-1">
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label={t("me.avatarZoom", { defaultValue: "Kattalashtirish" })}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel", { defaultValue: "Bekor qilish" })}
          </Button>
          <Button onClick={confirm} disabled={!nat}>
            {t("common.save", { defaultValue: "Saqlash" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
