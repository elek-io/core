# Non-dot OS junk in the generated .gitignore

The `.gitignore` Core writes at Project creation ignores every dot file and allowlists the three it wants back. That covers most of what the github/gitignore Global templates catch, but not the files that do not start with a dot.

## Current state

`createGitignore` in `src/service/ProjectService.ts` writes:

```text
# Ignore all hidden files and folders...
.*
# ...but these
!/.gitignore
!/.gitattributes
!/**/.gitkeep

# elek.io related ignores
collections/slug.index.json
components/slug.index.json
```

`.*` already handles `.DS_Store`, `._*` and `.Trash-*`. What it misses:

| File                       | Written by                                     |
| -------------------------- | ---------------------------------------------- |
| `Thumbs.db`, `ehthumbs.db` | Windows Explorer, in any folder holding images |
| `desktop.ini`              | Windows, on a folder whose view was customized |
| `$RECYCLE.BIN/`            | Windows, at the root of a drive                |

`Thumbs.db` is the one that matters. `lfs/` holds a Project's image binaries, so opening it in Explorer is enough to produce one, and it would then be committed and synced to everyone else on the Project.

## What to do

1. Add the four patterns to `createGitignore`.
2. Decide whether existing Projects get them. The file is written once at creation and never rewritten, so without a migration step only new Projects are covered.
3. If a migration is added, it rewrites a committed file. That is the same question every generated file faces, so it belongs with the first real migration rather than on its own.

## What it costs

Four lines for new Projects. The migration question is the real decision, and answering it here answers it for `.gitattributes` too.

## See also

- [`../contributing/migration-and-history-flow.md`](../contributing/migration-and-history-flow.md) - what changing a generated file needs
- [`../docs/storage-layout.md`](../docs/storage-layout.md) - what is and is not committed in a Project
