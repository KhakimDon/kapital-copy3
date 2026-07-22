// Web Push client for the messenger — registers the service worker (/sw.js),
// subscribes the browser to the backend's VAPID keypair, and mirrors the
// subscription to `km.msgr_push_subs` so OFFLINE recipients get a system
// notification for new messages (see backend messenger_push.rs).
//
// All entry points are guarded for browsers without serviceWorker/PushManager
// (older Safari, insecure origins) — they resolve to a no-op / false.
import { api } from "@/shared/api/client";

/** localStorage flag for the user's explicit choice ("on" | "off"). */
const PREF_KEY = "msgr:push";

/** True when this browser can do Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current Notification permission ("default" | "granted" | "denied"). */
export function pushPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

/** The user's stored preference — did they turn notifications on/off here? */
export function pushPref(): "on" | "off" | null {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(PREF_KEY) : null;
  return v === "on" || v === "off" ? v : null;
}

function setPref(v: "on" | "off") {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* storage disabled — preference just won't persist */
  }
}

/** base64url VAPID public key → the ArrayBuffer `applicationServerKey` wants. */
function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

/** Raw ArrayBuffer → base64url (no padding) — for the subscription keys. */
function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    // Idempotent: returns the existing registration if /sw.js is already active.
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function subscriptionBody(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? bufToBase64Url(sub.getKey("p256dh")),
      auth: json.keys?.auth ?? bufToBase64Url(sub.getKey("auth")),
    },
  };
}

/**
 * Turn notifications on: register the SW, request permission, subscribe with
 * the backend's VAPID key and POST the subscription. Returns true on success.
 * Records the user's "on" preference so it auto-enables next time.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await registration();
  if (!reg) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setPref("off");
    return false;
  }

  // Fetch the app-wide VAPID public key (base64url).
  let publicKey = "";
  try {
    const res = await api.get<{ publicKey: string }>("/messenger/push/vapid");
    publicKey = res.data.publicKey;
  } catch {
    return false;
  }
  if (!publicKey) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
      });
    } catch {
      return false;
    }
  }

  try {
    await api.post("/messenger/push/subscribe", subscriptionBody(sub));
  } catch {
    return false;
  }
  setPref("on");
  return true;
}

/** Turn notifications off: unsubscribe locally and drop it server-side. */
export async function disablePush(): Promise<void> {
  setPref("off");
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await api.post("/messenger/push/unsubscribe", { endpoint: sub.endpoint });
  } catch {
    /* best-effort — still unsubscribe locally below */
  }
  try {
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
}

/** Is a live push subscription currently registered in this browser? */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

/**
 * Called on messenger mount: if permission is already granted and the user
 * hasn't opted out, (re)subscribe silently so a fresh endpoint is always
 * mirrored to the backend. No-op otherwise.
 */
export async function autoEnablePush(): Promise<void> {
  if (!pushSupported()) return;
  if (pushPermission() !== "granted") return;
  if (pushPref() === "off") return;
  await enablePush();
}
