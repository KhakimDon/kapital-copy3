// Единственная Vercel serverless-функция мока. Все /api/* приходят сюда
// через rewrite в vercel.json (оригинальный путь — в query `p`).
// Отдаёт /api/v2/* тем же диспетчером, что и Vite dev-плагин.
import { handleApi } from "../mock/api-plugin.mjs";

export default async function handler(req, res) {
  try {
    // Восстанавливаем оригинальный путь: rewrite кладёт сегменты в `p`.
    const u = new URL(req.url, "http://localhost");
    const p = u.searchParams.get("p") || "";
    u.searchParams.delete("p");
    const qs = u.searchParams.toString();
    req.url = "/api/" + p + (qs ? "?" + qs : "");

    const handled = await handleApi(req, res);
    if (!handled) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "not found", url: req.url }));
    }
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e && e.stack ? e.stack : e) }));
  }
}
