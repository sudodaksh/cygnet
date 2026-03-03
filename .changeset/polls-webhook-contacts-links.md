---
"cygnet": minor
---

### Signal Polls

Full poll lifecycle support — create, vote, and close polls via `api.createPoll()`, `api.voteInPoll()`, and `api.closePoll()`, with matching convenience methods on the context. Three new filter queries: `message:poll_create`, `message:poll_vote`, and `message:poll_close`, each with compile-time type narrowing.

### Webhook Transport

New `"webhook"` transport option. `WebhookListener` starts an HTTP server that receives POSTs from signal-cli-rest-api's `RECEIVE_WEBHOOK_URL` mode. Zero external dependencies. Accepts both raw JSON-RPC wrapped payloads and plain `RawUpdate` objects.

### Link Previews

Added `linkPreview` option to `SendOptions` for attaching URL previews (title, description, thumbnail) when sending messages.

### Contacts API

New methods: `listContacts()`, `getContact()`, `updateContact()`, and `getContactAvatar()` for reading and managing Signal contacts.

### Bug Fixes

- Fixed command regex silently dropping multi-line arguments — `.*` replaced with `[\s\S]*` so commands like `/code` correctly capture text containing newlines.
- Fixed webhook handler rejecting all messages from signal-cli-rest-api due to unexpected JSON-RPC wrapper around the payload.
