# Telegram notifications

Every board event — a task **created**, **moved**, **completed**, **assigned**, **commented**, **updated** or **deleted** — is automatically posted to your Telegram **group**. The team sees what is going on without even opening the board.

To set it up:

1. The tenant admin creates a bot via [@BotFather](https://t.me/BotFather) and adds its token under *Project settings → **Telegram notifications** → **Bots***. Only an admin can add a token.
2. Add the bot as a member of your Telegram group.
3. Get the group **chat ID** — for example by adding [@getidsbot](https://t.me/getidsbot) to the group. A group ID starts with `-100`.
4. In Project settings pick the bot, enter the chat ID, choose which events to send, check with the **Test** button and press **Save**.

One bot can be connected to many projects — each project posts to its own group.

> Notifications are sent both for changes made in the app and for changes made [via AI (MCP)](page:connect).

---

**Related pages:** [Project settings](page:settings) · [Notifications](page:notifications) · [Connect an AI assistant (MCP)](page:connect)
