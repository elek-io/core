---
'@elek-io/core': patch
---

Reading a file at a commit no longer fails on Windows when the data directory is deeply nested. Core read those blobs with `git show <commit>:<path>`, and git stats that argument against the working directory to tell revisions from filenames. The stat adds the 40 character commit hash on top of an already absolute path, which overflowed the 260 character limit on Windows and failed history diffs with `fatal: failed to stat: Filename too long`, even though every real file was well within the limit. Core now reads through `git cat-file blob`, which resolves the blob from the object database and never touches the working tree. The returned content is unchanged, including LFS pointers and binary Assets.
