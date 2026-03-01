# Examples

All examples expect a running `signal-cli-rest-api` instance and read:

- `SIGNAL_SERVICE` (default: `localhost:8080`)
- `PHONE_NUMBER` (default: `+491234567890`)

Run them with Bun from the repository root:

```bash
bun run examples/hello-world.ts
```

Available examples:

- `examples/hello-world.ts`: minimal bot setup and plain text replies
- `examples/commands.ts`: command parsing with `ctx.match`
- `examples/reactions.ts`: react to messages, handle incoming reactions
- `examples/quotes-and-replies.ts`: quote messages, handle incoming quotes
- `examples/typing-and-receipts.ts`: typing indicators, delivery/read receipts
- `examples/edit-and-delete.ts`: edit and delete sent messages, handle edits/deletes
- `examples/group-updates.ts`: `group_update` handling with persisted group state
- `examples/audio-files.ts`: attachment filtering for audio content
- `examples/wizard-register.ts`: session-backed registration wizard
