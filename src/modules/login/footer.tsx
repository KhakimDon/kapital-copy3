import { Instagram, Linkedin, Facebook, Send } from "lucide-react";
import { useFooterConfig, type FooterSocials } from "@/shared/api/footer";

// Platform → lucide icon (Telegram uses the paper-plane `Send`, lucide has no
// dedicated Telegram glyph).
const SOCIAL_ICONS: { key: keyof FooterSocials; Icon: typeof Instagram; label: string }[] = [
  { key: "instagram", Icon: Instagram, label: "Instagram" },
  { key: "linkedin", Icon: Linkedin, label: "LinkedIn" },
  { key: "telegram", Icon: Send, label: "Telegram" },
  { key: "facebook", Icon: Facebook, label: "Facebook" },
];

/**
 * Login-screen footer — legal/info links (left) and social icons (right),
 * both driven by the platform config edited in the superadmin panel.
 * Renders nothing until there's at least one link or social to show.
 */
export function LoginFooter() {
  const { data } = useFooterConfig();
  const links = data?.links?.filter((l) => l.label?.trim()) ?? [];
  const socials = SOCIAL_ICONS.filter((s) => (data?.socials?.[s.key] ?? "").trim());

  if (!links.length && !socials.length) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-5">
      <div className="pointer-events-auto mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-white/75 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>
        {socials.length > 0 && (
          <div className="flex items-center gap-2">
            {socials.map(({ key, Icon, label }) => (
              <a
                key={key}
                href={data!.socials[key]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                className="flex size-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-4"
              >
                <Icon />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
