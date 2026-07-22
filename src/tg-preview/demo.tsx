import { useState } from "react";
import { Spoiler } from "@/modules/messenger/tg/spoiler";
import { AnimatedSticker } from "@/modules/messenger/tg/animated-sticker";
import "@/modules/messenger/tg/_foundation/tg-vars.css";

export function Demo() {
  const [dark, setDark] = useState(false);
  const toggle = () => {
    const n = !dark;
    setDark(n);
    document.documentElement.classList.toggle("dark", n);
  };
  return (
    <div
      className="tg-surface"
      style={{
        minHeight: "100vh",
        background: "var(--color-background-secondary)",
        color: "var(--color-text)",
        padding: 28,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <button
        onClick={toggle}
        style={{
          marginBottom: 24,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid var(--color-borders)",
          background: "var(--color-background)",
          color: "var(--color-text)",
          cursor: "pointer",
        }}
      >
        {dark ? "☀️ Light" : "🌙 Dark"}
      </button>

      <h2 style={{ marginBottom: 10, fontSize: 15, color: "var(--color-primary)" }}>
        REAL SPOILER — bosib oching (asl nuqta-tekstura + pulse animatsiya)
      </h2>
      <div
        style={{
          maxWidth: 560,
          lineHeight: 1.7,
          fontSize: 16,
          background: "var(--color-background)",
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--color-borders)",
        }}
      >
        Yig'ilish natijasi: <Spoiler containerId="s1">loyiha byudjeti 40% ga oshirildi</Spoiler>. Iltimos,{" "}
        <Spoiler containerId="s1">hech kimga aytmang</Spoiler> — bu maxfiy.
      </div>

      <h2 style={{ margin: "28px 0 10px", fontSize: 15, color: "var(--color-primary)" }}>
        REAL TGS STICKER — animatsion (lottie-web + DecompressionStream)
      </h2>
      <div
        style={{
          display: "inline-block",
          background: "var(--color-background)",
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--color-borders)",
        }}
      >
        <AnimatedSticker tgsUrl="/tg-party.tgs" size={180} />
      </div>
    </div>
  );
}
