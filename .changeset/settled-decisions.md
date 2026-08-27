---
'@elek-io/core': major
---

Settled six questions the code and the docs disagreed on. Two of them change a public shape.

**`core.git.status()` returns a described status.** It used to return `{ filePath }[]`, read off field index 8 of every porcelain v2 line. That field is `undefined` for an untracked entry, the similarity score for a rename, and the first word only for a path holding a space, so the array was reliable for nothing but its length.

```ts
const status = await core.git.status(projectPath);
// { isClean: false, files: [{ path: 'a file.txt', status: 'modified', isStaged: false }] }
```

Lines are read by their type prefix now and the path is taken as the rest of the line. `status` is one of `added`, `modified`, `deleted`, `renamed`, `untracked` and `unmerged`, and `isStaged` says whether the change is in the index. `projects.synchronize()` puts `files` into the `PreconditionFailed` it raises on a dirty tree, so a caller can finally say which files are in the way.

Anyone reading `filePath` off the returned array has to move to `files[].path`, and a `status.length > 0` check becomes `!status.isClean`.

**`slug.index.json` is not written any more.** The UUID-to-slug map is what resolves a slug and enforces slug uniqueness, and it lives in memory per Core instance. The file next to it was written on every mutation and never read back, not even by the rebuild, which scans the entity folders instead.

The map is unchanged, so nothing about resolving or creating by slug behaves differently. `core.util.pathTo.collectionIndex` and `core.util.pathTo.componentIndex` are gone with the file, as is the exported `slugIndexFileSchema`. A Project written by an older Core keeps its leftover files, and the generated `.gitignore` still names them so they do not show up as changes. `docs/storage-layout.md` says why reading such a file back is not a free optimisation.

**A failed release leaves nothing behind.** `releases.create()` and `releases.createPreview()` recovered by switching back to `work`, which for a preview undid nothing at all, because a preview never leaves `work`. A failed preview kept its version commit and possibly an unpushed tag, and a full release that failed after tagging kept the merge, the version commit and the tag.

Both now unwind: the tag is deleted, every branch they moved is reset to the commit it was on, and the Project is left on `work`. A push failure unwinds too, so a release is never made-but-unpublished, and the same call can simply be retried. Recovery is best effort and warns about a step it could not complete.

**`ProjectService` writes roll back.** `update` is wrapped in `withGitRollback`, which is what `contributing/error-handling-internals.md` already claimed of every entity write, so a failure between writing `project.json` and committing it no longer leaves the tree modified. `delete` rolls back its removal, with the guards left outside so a refused delete never touches the working tree.

`create` cannot use the wrapper, because for most of its window there is no `HEAD` to reset to. It removes the folder it made instead of routing through `delete()`, which asked git about a folder that may not be a repository yet and replaced the error the caller has to see with its own.

**An unmatched resolution slug is refused.** A `resolutions` entry naming a field the new definitions do not declare was written into the Entry with no validation at all. Both `collections.update()` and `components.update()` now check every resolution slug before anything is written and throw `BadRequest` naming the Entry and the slug, so a stale resolution fails the whole update rather than reaching one Entry.

**`datetime(0)` is the epoch.** The guard was `!value`, so the one numeric value that is falsy came back as the current time. It reads `undefined` and the empty string as absent now, which keeps every internal caller identical, since they all stamp `created` and `updated` by calling it with no argument.
