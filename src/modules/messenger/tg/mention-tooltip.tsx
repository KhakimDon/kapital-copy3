// @mention autocomplete — a port of Telegram Web A's MentionTooltip
// (middle/composer/MentionTooltip.tsx). When the user types `@…` in a group the
// composer feeds this a filtered member list; each row is a member (avatar +
// name + @username). Selection + keyboard navigation (↑/↓/Enter/Tab) live in the
// composer because our plain textarea keeps focus; this component renders the
// list and highlights `activeIndex`, mirroring the reference's `.MentionTooltip`
// `.composer-tooltip` DOM.
import { cn } from "@/shared/lib/utils";
import { ChatAvatar } from "../avatar";
import { tgPeerPhotoUrl, type TgMember } from "./api";
import { useTgMediaSrc } from "./media";

/** One member avatar — resolves the auth'd peer photo, falls back to initials. */
function MentionAvatar({ accountId, member }: { accountId: number; member: TgMember }) {
  const { src, failed } = useTgMediaSrc(
    member.avatarUrl ?? tgPeerPhotoUrl(accountId, member.id),
  );
  return (
    <ChatAvatar
      seed={member.username || String(member.id)}
      name={member.name}
      src={failed ? null : src}
      size={36}
    />
  );
}

export function TgMentionTooltip({
  accountId,
  members,
  activeIndex,
  onSelect,
  onHover,
}: {
  accountId: number;
  members: TgMember[];
  activeIndex: number;
  onSelect: (member: TgMember) => void;
  onHover?: (index: number) => void;
}) {
  if (members.length === 0) return null;
  return (
    <div className="MentionTooltip composer-tooltip custom-scroll" role="listbox">
      {members.map((m, i) => (
        <button
          key={m.id}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          className={cn("mention-item", i === activeIndex && "active")}
          // keep the textarea selection/caret — don't focus the button
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover?.(i)}
          onClick={() => onSelect(m)}
        >
          <MentionAvatar accountId={accountId} member={m} />
          <span className="mention-info">
            <span className="mention-name">{m.name}</span>
            {m.username && <span className="mention-handle">@{m.username}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Filter members for a `@query` (name or username, case-insensitive). Empty
 *  query returns the head of the list (Telegram shows recent/all members). */
export function filterMembers(members: TgMember[], query: string, max = 24): TgMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members.slice(0, max);
  const out: TgMember[] = [];
  for (const m of members) {
    if (
      m.name.toLowerCase().includes(q) ||
      (m.username && m.username.toLowerCase().includes(q))
    ) {
      out.push(m);
      if (out.length >= max) break;
    }
  }
  return out;
}
