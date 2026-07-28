---
'@elek-io/core': patch
---

Listing Assets or Entries no longer warns about the files Core writes itself. Reading a Project printed `Function "getFileReferences" is ignoring file ".gitkeep"` for the marker that keeps an empty Assets folder in git, and the same for the `collection.json` that sits where a Collection's Entries are. Both are part of the documented storage layout, so the warning was Core complaining about its own files. In an Astro site the loaders read a Project on every build and every dev start, which made this the loudest thing in the log. Any other file that does not parse is still warned about by name.
