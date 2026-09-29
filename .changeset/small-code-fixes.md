---
'@elek-io/core': minor
---

Fixed six small bugs, each of which made Core do something other than what its own documentation says.

**A numeric bound of 0 is enforced.** `getNumberValueContentSchemaFromFieldDefinition` guarded its bounds with truthiness, so a `number` or `range` field declared from `0` to `100` enforced its ceiling and not its floor, and one declared from `-100` to `0` enforced its floor and not its ceiling. Those two field types are the only ones whose bounds can hold a `0`, because every string length is at least `1`.

A Value outside such a bound is rejected now where it was accepted before, which is what the field definition asked for in the first place.

**A tagged tip reports its tag.** `git log --format=%D` lists every decoration of a commit, so the tip of a branch carrying a tag reads `HEAD -> master, tag: <uuid>`. `refNameToTagName` stripped `tag: ` out of that whole string and then rejected what was left for not being a UUID, so `core.git.log()` answered `tag: null` on exactly the commit a Release had just tagged. It reads the tag out of the decoration list now.

**Deleting a git tag is guarded.** `core.git.tags.delete()` carried neither the read-only guard nor the provisioned-copy guard that `create` has, so a read-only Core could throw a Release away and a provisioned copy could be mutated. Both now throw `PreconditionFailed`, as every other mutation on those two does.

**A missing `componentResolver` throws a `CoreError`.** `getValueSchemaFromFieldDefinition` threw a plain `Error` for a `component` field passed without a resolver, so it escaped the promise that `CoreError` is the whole catch. It throws `Internal` now.

**The Astro entry owns no process error handlers.** `docs/usage.md` says the Astro entry sets `log.hasProcessErrorHandlers` to `false` for you, because inside a build the host owns the process. `elek()` did not, so its short-lived Core registered `uncaughtException` and `unhandledRejection` for the duration of the `astro:config:setup` hook. The loaders' own Core always passed the option.

**The CLI watcher ignores `.git` on Windows.** `elek generate:*` in watch mode filtered on a POSIX separator only, so on Windows every one of Core's own git writes retriggered the regeneration that caused them.
