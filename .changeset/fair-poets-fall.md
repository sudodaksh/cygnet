---
"cygnet": minor
---

Added major feature coverage across attachments, groups, and profiles.

- Added full attachment lifecycle support:
  - Receive convenience via `ctx.attachments`
  - Download helpers via `ctx.downloadAttachment()` and `api.downloadAttachment()`
  - Attachment listing/deletion via `api.listAttachments()` and `api.deleteAttachment()`
  - New encoding helpers: `encodeAttachment()` and `encodeAttachmentBuffer()`
  - Improved `"message:attachments"` filter narrowing for safer TypeScript usage
- Added comprehensive group management APIs:
  - Create/get/update groups
  - Add/remove members and admins
  - Join/leave/block group operations
  - Group avatar fetch
  - Expanded group-management example commands
- Added profile update support via `api.updateProfile()` with typed options
- Added release automation scaffolding (CI, Changesets workflow, guarded npm publish workflow) and release documentation
