// Reusable round control buttons for the call overlay (mic / camera / screen /
// speaker / hangup) plus a small device-picker dropdown. Kept presentational —
// all state + handlers come from the overlay via props.
import type { ReactNode } from "react";
import {
  ChevronDown,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import type { DeviceKind, LiveDevices } from "./use-livekit";

/** One round control button with an icon and a label underneath. */
export function CallButton({
  icon,
  label,
  onClick,
  active = false,
  danger = false,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  /** Highlighted / "on" state (e.g. screen-sharing). */
  active?: boolean;
  /** Red hangup styling. */
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "grid size-14 place-items-center rounded-full text-white shadow-lg transition-transform",
          "hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100",
          danger
            ? "bg-destructive"
            : active
              ? "bg-white text-neutral-900"
              : "bg-white/15 backdrop-blur hover:bg-white/25",
        )}
      >
        {icon}
      </button>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
    </div>
  );
}

export function MicButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <CallButton
      icon={on ? <Mic className="size-6" /> : <MicOff className="size-6" />}
      label={label}
      onClick={onToggle}
      active={!on}
    />
  );
}

export function CamButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <CallButton
      icon={on ? <Video className="size-6" /> : <VideoOff className="size-6" />}
      label={label}
      onClick={onToggle}
    />
  );
}

export function ScreenButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <CallButton
      icon={on ? <MonitorOff className="size-6" /> : <Monitor className="size-6" />}
      label={label}
      onClick={onToggle}
      active={on}
    />
  );
}

export function SpeakerButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <CallButton
      icon={on ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
      label={label}
      onClick={onToggle}
      active={!on}
    />
  );
}

export function SwitchCamButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <CallButton icon={<RefreshCw className="size-6" />} label={label} onClick={onClick} />;
}

export function HangupButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <CallButton icon={<PhoneOff className="size-6" />} label={label} onClick={onClick} danger />;
}

/** Device selection dropdown (mic / camera / speaker) for the active call. */
export function DeviceMenu({
  devices,
  onSelect,
  showCam,
  label,
  labels,
}: {
  devices: LiveDevices;
  onSelect: (kind: DeviceKind, deviceId: string) => void;
  showCam: boolean;
  label: string;
  labels: { mic: string; cam: string; speaker: string };
}) {
  const group = (kind: DeviceKind, title: string, list: MediaDeviceInfo[], current?: string) =>
    list.length > 0 && (
      <>
        <DropdownMenuLabel className="text-xs text-muted-foreground">{title}</DropdownMenuLabel>
        {list.map((d, i) => (
          <DropdownMenuItem
            key={d.deviceId || i}
            onClick={() => onSelect(kind, d.deviceId)}
            className={cn("text-sm", current && d.deviceId === current && "font-semibold text-[#3390ec]")}
          >
            {d.label || `${title} ${i + 1}`}
          </DropdownMenuItem>
        ))}
      </>
    );

  return (
    <div className="flex flex-col items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="grid size-14 place-items-center rounded-full bg-white/15 text-white shadow-lg backdrop-blur transition-transform hover:scale-105 hover:bg-white/25 active:scale-95"
          >
            <ChevronDown className="size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="max-h-72 w-64 overflow-y-auto">
          {group("audioinput", labels.mic, devices.mics, devices.current.mic)}
          {showCam && devices.cams.length > 0 && <DropdownMenuSeparator />}
          {showCam && group("videoinput", labels.cam, devices.cams, devices.current.cam)}
          {devices.speakers.length > 0 && <DropdownMenuSeparator />}
          {group("audiooutput", labels.speaker, devices.speakers, devices.current.speaker)}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
    </div>
  );
}
