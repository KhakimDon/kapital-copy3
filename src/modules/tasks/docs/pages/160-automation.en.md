# Automation

The board can do repetitive work for you. **Automation** is a set of no-code rules. They live under *[Project settings](page:settings) → **Automation***; the project owner/admin sets them up.

Every rule has three parts:

- **WHEN** (trigger) — which event runs the rule;
- **IF** (conditions) — optional filters;
- **THEN** (actions) — what to do.

## Creating a rule

1. In Project settings find the **Automation** section and press **Rule**.
2. Enter a rule name.
3. **When** — pick a trigger:
   - **When created** — a new task appears (optional: in which column);
   - **When moved** — a card moves from column to column; you can set the **From** and **To** columns (or «Any»);
   - **When assigned** — the assignee changes;
   - **When priority changes** — optional: to which new priority;
   - **When commented** — a comment is added to the task.
4. **If** — add a condition if needed: field (**Priority**, **Column**, **Type**, **Assignee**, **Label**, **Title**) + condition (**is**, **is not**, **empty**, **not empty**, **contains**) + value. If there are several conditions, all must match.
5. **Then** — add one or more actions:
   - **Move to column** — moves the card to the chosen column;
   - **Assign** — to a chosen user, to the **Reporter**, or **Unassign**;
   - **Change priority**;
   - **Add label** / **Remove label**;
   - **Shift due date** — shifts the due date by the given number of days;
   - **Add comment** — an automatic comment from a template;
   - **Notify watchers** — sends a [notification](page:notifications) to watchers;
   - **Telegram message** — a templated message to the [connected Telegram group](page:telegram).
6. Press **Save**.

Placeholders work in comment and Telegram templates: `{{title}}` — task title, `{{actor}}` — the user who did the action, `{{priority}}` — priority.

## Enable and disable

Each rule in the list has a switch on the left — you can pause a rule without deleting it. The pencil edits it, the trash bin deletes it.

## Examples

- **When moved to «Done»** → **Add comment**: `{{actor}} finished the task` + **Telegram message**.
- **When created**, if **Assignee is empty** → assign to the **Reporter**.
- **When priority changes** (new priority: Urgent) → **Add label**: `urgent` + **Notify watchers**.

> Rules run for changes made in the app and for changes made [via AI (MCP)](page:connect). One rule's action can trigger another — the chain runs at most 3 steps deep.

---

**Related pages:** [Project settings](page:settings) · [Telegram notifications](page:telegram) · [Notifications](page:notifications)
