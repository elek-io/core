---
'@elek-io/core': minor
---

**Each website keeps the version of its theme's Contract it uses until the Mapping covers a newer one, so a theme update never stops a Release.** A theme releases a version by tagging it, and a newer one waits beside the version in use with a Mapping of its own.

```bash
elek website:update --project <id> --name autohaus-ebersfelde.de
```

One command brings the theme's newest tagged version to the website and switches to it. While anything the new version needs is unmapped or any Entry does not fit, it names each item, leaves the website on the version it uses and exits non-zero, so the site goes on building. Each run fills what the Project has gained into the waiting Mapping, so a field definition carrying the id the new version's Contract names switches a run that was refused before. `--theme-version` switches to a version of your choice, and a website already on the version asked for is left alone.

**`core.destinations` follows a theme's versions in three calls**, which is what an app offers an editor:

```typescript
const newer = await core.destinations.newerVersions({ projectId, id });
const kept = await core.destinations.keepVersion({ projectId, id });
kept.outcome; // 'waiting', or 'in-use' for the version the website uses

const switched = await core.destinations.switchVersion({ projectId, id });
switched.outcome; // 'switched', or 'kept' while switched.issues names what is left
```

- `newerVersions()` lists the versions tagged at the website's theme that are newer than the one in use, newest first, read with your own git access. A pre-release is listed and is taken only when it is named. The new `isPreReleaseVersion(version)` says which one is a pre-release, so an app offering a version reads that the way Core does.
- `keepVersion()` keeps a copy of that version's Contract in the Project and puts the version beside the one in use. Its Mapping starts out as what the Mapping in use fills, plus every field the new version added whose id one of the Project's own field definitions carries.
- Every version newer than the one in use replaces the one that waits, a version older than that one included, keeping what was mapped for it. A version older than the one in use throws `PreconditionFailed`, and one whose Contract carries another name than the version in use `BadRequest`, whether that name comes from the theme or from the copy the Project already keeps of that version.
- `switchVersion()` switches only once nothing of the Project is left that the waiting version cannot take. Otherwise nothing is written and `issues` names each item, the way `checkAll()` does.
- `check()` and `checkAll()` take `isWaitingVersion: true` for what the waiting version cannot take, and `update()` takes `waitingMapping` to replace its Mapping, so an editor maps the new version while the old one stays in use.
- `core.contracts.versionsFromTheme({ url })` lists every version tagged at an address, without reading a Contract there.

**Two websites on one theme each keep their own version.** Switching one leaves the other as it is. Finding and keeping a new version reads the theme's address, while switching, checking and building read the Contract copies the Project keeps, so a switch needs no access to the theme. A site's build reads the version its website uses and never one that waits, so a theme's new version changes nothing until the website switches to it.

A website with no version waiting behaves exactly as before: `destination.json` gains `waiting`, and a file written before a version could wait reads as one that follows the version it uses. See `docs/destinations.md`.

**A version is what Semantic Versioning 2.0.0 says it is**, in every version Core parses. So `1.1.0-rc-hotfix.1` is a version and a theme's tag for it is read, while `01.1.0` and `1.0.0-beta_1` are refused rather than kept and compared later.
