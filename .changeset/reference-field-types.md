---
'@elek-io/core': minor
---

Generated types now describe what a `reference` field points at. Both generators emitted `Array<{ id: string; objectType: string }>` for every reference field, which said neither what kind of thing was on the other end nor how to reach it. The field definition has always known, so the type now says so too:

```typescript
entry.data.cover.en; // Array<{ id: string; objectType: 'asset' }>
entry.data.related.en; // Array<{ id: string; objectType: 'entry'; collectionId: string }>
```

`collectionId` is the part that was missing. An Entry reference has always carried it at runtime, and it is what tells you which Collection the referenced Entry lives in when a field allows more than one. Following a reference is then a `getEntry` away, which the Astro section of `usage.md` now shows for both kinds.

This applies to the Astro loaders and to `elek generate:types` alike. On the CLI side a reference field also gains the per-language narrowing every other field type already had, so it is `Omit<ReferencedValue, 'content'> & { content: Record<ProjectLanguage, ...> }` rather than a bare `ReferencedValue`. Type-checking against the new types can surface code that treated `objectType` as an open string, for example a branch for a kind the field cannot hold.
