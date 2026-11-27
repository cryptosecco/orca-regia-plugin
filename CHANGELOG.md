# Changelog

## 0.8.5 — 2026-11-27

- The options of a question in the Queue are buttons, one per line, with the recommended one marked; an item with several questions gets one group per question, and an option's note shows under its label.
- A new menu in the Queue, **Send choices to**, under "Decide now": nobody (the default) or one of your bots. Nobody: a click sends nothing; it copies your answer and opens the chat of the bot that asked. A bot: a click sends your choice to that bot as a status message, once, so it can record it on the item. The card says "Sending…", "Sent at 10:42" or "Not sent" with the reason. Picking a bot sends nothing, and nothing is ever sent without your click.
- Same capabilities and settings as 0.8.4: the pick is kept in the plugin's own storage, so updating does not ask for approval again.

## 0.8.4 — 2026-11-26

- Fixed: a bot counted once per chat. Orca lists every chat a bot has ever had in its home, old and finished ones included, and the Office made an avatar of each: with about ten bots the bots' room could show 65 avatars and the Office 74 agents. Now each bot is one avatar, known by its id, with the state of its most active chat (waiting on you, then working, then in error, then the latest) and a click opens that chat. The Office tab, the scoreboard, the "all" and "idle" counts and the status bar count the same avatars. Workers a bot started stay agents, one each. A chat that waits on you is still among what waits on you.
- Fixed: a bot's workspaces are matched by id, not by name, so a bot with a workspace called "main" no longer gets every other project's "main" and its agents.
- Fixed: the same bot listed twice by `orca bot list` (once from a paired server that is the same Orca) is one bot. With the optional state file, an agent that edits a bot's files from a project stays an agent of that project.
- Same capabilities and settings as 0.8.3: no new approval.

## 0.8.3 — 2026-11-26

- CLI marks: the scoreboard and the Office show the `>_` of Codex and the mark of Grok CLI instead of a plain shape. Claude Code and Gemini CLI keep a plain shape with the name written: their owners' trademark rules ask for permission first. Details and attributions in NOTICE.md.
- The audit sandbox, if you have one: when `~/orca/sandbox/` exists and a run is going, the scoreboard says "N in sandbox" and "N blocked", whoever runs third-party code gets a lock and walks into a fenced Sandbox room in the Office, every blocked attempt flashes red, and a click opens the run, live, then its log. The status-file format is in the README. Without that folder nothing appears, nothing is read and nothing is watched.
- Same capabilities and settings as 0.8.2: no new approval.

## 0.8.2 — 2026-11-24

- The Office is a map: one room per project, one avatar per bot and agent, at a desk when working, with a question mark when waiting on you. The list is one click away.
- The scoreboard goes from total to detail: agents working, then by provider, then waiting and failing. A number opens the list of those agents.
- Quieter pages: fewer colors, decisions as cards, long explanations behind "how to read this"; the header speaks only when a source stops answering.
- If the optional "State file" setting is filled in and the file stops updating for more than a minute, a red band and a red status bar item say so, and its last data stays on screen marked "not updated since". Without that setting nothing changes.
- Fixed: two worker cards could overlap in the diagram.
- Same capabilities and settings as 0.8.1: no new approval.

## 0.8.1 — 2026-11-21

- Smaller package: screenshots as WebP at 1600×1000.

## 0.8.0 — 2026-11-21

- First public release: a read-only control room for Orca bots in the right sidebar, with four views (Overview, Queue, Flows, Office), a status bar item and a desktop notification when something new waits on you.
