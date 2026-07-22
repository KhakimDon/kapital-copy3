# Connect an AI (MCP)

The **AIBA MCP server** connects your favourite AI assistant — **Claude**, **ChatGPT** or **Gemini** — directly to your AIBA data. Then everything happens in plain chat: "what are my tasks for today?", "find the rent contract file", "what's the status of the July tax reports?" — the AI does it on your behalf.

## Get a token

1. Click your avatar in the top-right → **MCP**.
2. Press **Generate** to create your personal token.
3. Copy the **Connector URL** that appears. It looks like this:
   `https://next.aiba.uz/api/v2/mcp/t/<token>`

## Connect Claude

1. In Claude open *Settings → Connectors → **Add custom connector***.
2. Enter a name (e.g. "AIBA") and paste the copied address into the URL field.
3. **Leave the OAuth fields empty** (Client ID / Client Secret) — the token is already inside the URL.
4. Press **Add**. You can now ask about AIBA right in the chat.

## Connect ChatGPT and Gemini

The same URL works:

- **ChatGPT**: under *Settings → Connectors* add a new connector, paste the URL, leave the authentication fields empty.
- **Gemini**: in settings open the section for adding an MCP server / connector, paste the URL — no extra authentication is needed.

The AI acts only **within your permissions** — it can never do anything you are not allowed to do.

> **The Connector URL is a secret.** Anyone who has this URL acts in AIBA as you. If it leaks, press **Revoke** on the same MCP page — the old URL stops working instantly.

---

**Related pages:** [MCP modules](page:modules)
