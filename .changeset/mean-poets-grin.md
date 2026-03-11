---
"cygnet": patch
---

Ignore the bot's own outgoing and sync updates by default, aligning cygnet with grammY/Telegram-style bot behavior and preventing self-reply loops in scenes and other handlers.

Also cleans up the examples by removing the temporary voice transcriber example and relying on the new core behavior instead of per-example self-message guards.
