/* AIBA messenger service worker — Web Push for new messages.
 *
 * Served at the site root (/sw.js) so its scope covers the whole SPA. Plain
 * framework-free JS: Vite copies public/ verbatim, so this file is NOT bundled.
 *
 * Two jobs:
 *  - `push`             → show a system notification for a new message.
 *  - `notificationclick`→ focus an existing app tab (or open one) at the chat.
 *
 * The push payload is the small JSON the backend sends
 * (messenger_push.rs): { title, body, chatId, tenant }.
 */

self.addEventListener("install", () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of already-open clients right away.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    // Non-JSON payloads fall back to a generic message.
    data = { title: "Yangi xabar", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Yangi xabar";
  const chatId = data.chatId || "";
  const options = {
    body: data.body || "",
    icon: "/pwa-icon.svg",
    badge: "/pwa-icon.svg",
    // Same tag per chat coalesces a burst of messages into one notification.
    tag: chatId ? "msgr-" + chatId : "msgr",
    renotify: true,
    data: { chatId: chatId },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chatId = (event.notification.data && event.notification.data.chatId) || "";
  const target = chatId ? "/messenger?chat=" + encodeURIComponent(chatId) : "/messenger";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an already-open app tab and route it to the chat.
        for (const client of clients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client && chatId) {
              try {
                client.navigate(target);
              } catch (_e) {
                /* cross-origin or detached — ignore */
              }
            }
            return undefined;
          }
        }
        // No tab open → open a fresh one at the chat.
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
