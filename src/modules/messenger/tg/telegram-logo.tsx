// The Telegram mark (blue disc + white paper plane), inlined as an SVG so the
// UI never makes an external request for it. Used to tag corporate-Telegram
// chats inside the internal messenger, where they sit next to AIBA-native chats.
export function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="tgLogoGrad" x1="0.667" y1="0.167" x2="0.417" y2="0.75">
          <stop offset="0" stopColor="#37aee2" />
          <stop offset="1" stopColor="#1e96c8" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="120" fill="url(#tgLogoGrad)" />
      <path
        fill="#ffffff"
        d="M55 116l131-50c6-2 11 1 9 10l-22 105c-2 7-6 9-13 6l-35-26-17 16c-2 2-4 4-8 4l3-38 69-62c3-3-1-4-5-2l-85 54-37-12c-8-2-8-8 2-11z"
      />
    </svg>
  );
}
