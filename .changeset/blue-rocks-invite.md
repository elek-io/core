---
'@elek-io/core': minor
---

- Git commit messages now use human-readable subject lines with git trailers (Method:, Object-Type:, Object-Id:, Collection-Id:) instead of JSON.stringify
- Git tag messages use a typed GitTagMessage discriminated union (release, preview, upgrade) serialized as git trailers (Type:, Version:, Core-Version:)
- Removed releaseTypeSchema and releaseTagMessageSchema from releaseSchema.ts — tag message typing now lives in gitSchema.ts
- Tightened Zod schemas: commit hash uses z.hash('sha1'), datetimes use z.iso.datetime(), migrateProjectSchema uses z.looseObject()
- Fixed email truncation bug in GitTagService.list() caused by a redundant slice(0, -1)
- Added pipe-character validation on gitSignatureSchema.name to prevent delimiter collision in parsed output
- Changed parseTagTrailers to return null and log a warning for unrecognized tag types instead of throwing
