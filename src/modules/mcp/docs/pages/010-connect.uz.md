# AI'ga ulanish (MCP)

**AIBA MCP serveri** sevimli AI yordamchingizni — **Claude**, **ChatGPT** yoki **Gemini** — to'g'ridan-to'g'ri AIBA ma'lumotlaringizga ulaydi. Keyin hammasi oddiy chat orqali: "bugungi vazifalarim qanday?", "ijara shartnomasi faylini top", "iyul soliq hisobotlari qay holatda?" — AI siz nomingizdan bajaradi.

## Tokenni olish

1. Yuqori o'ngdagi profil rasmingizni bosing → **MCP**.
2. **Generate** tugmasi bilan shaxsiy tokeningizni yarating.
3. Chiqqan **Connector URL** ni nusxalang. U shunday ko'rinishda bo'ladi:
   `https://next.aiba.uz/api/v2/mcp/t/<token>`

## Claude'ga ulash

1. Claude'da *Settings → Connectors → **Add custom connector*** ni oching.
2. Nom yozing (masalan, "AIBA") va URL maydoniga nusxalagan manzilni qo'ying.
3. OAuth (Client ID / Client Secret) maydonlarini **bo'sh qoldiring** — token URL'ning o'zida.
4. **Add** ni bosing. Endi chatda AIBA haqida so'rashingiz mumkin.

## ChatGPT va Gemini'ga ulash

Xuddi shu URL ishlaydi:

- **ChatGPT**: *Settings → Connectors* bo'limida yangi connector qo'shing, URL ni qo'ying, autentifikatsiya maydonlarini bo'sh qoldiring.
- **Gemini**: sozlamalarda MCP server / connector qo'shish bo'limini oching, URL ni qo'ying, qo'shimcha autentifikatsiya talab qilinmaydi.

AI faqat **sizning huquqlaringiz** doirasida ishlaydi — sizga ruxsat berilmagan narsani u ham qilolmaydi.

> **Connector URL — sir.** Bu URL kimda bo'lsa, u AIBA'da siz nomingizdan ish qiladi. Tarqalib ketsa, o'sha MCP sahifasida tokenni **Revoke** qiling — eski URL darhol ishlamay qoladi.

---

**Aloqador sahifalar:** [MCP modullari](page:modules)
