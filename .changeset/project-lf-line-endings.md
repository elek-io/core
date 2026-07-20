---
'@elek-io/core': patch
---

Projects are now byte identical no matter which OS created them. The generated `.gitignore` and `.gitattributes` were joined with the platform newline, so Windows wrote them with CRLF and every other OS with LF. The same Project opened on a second OS was then rewritten line by line, and a team on mixed operating systems could conflict on every line of every file.

Both files are now written with LF, and the generated `.gitattributes` starts with `* text=auto eol=lf` so a checkout stays LF even when the machine has `core.autocrlf` enabled, which is a per machine git setting Core does not control. The `lfs/**` rules follow it and keep their `-text` marker, so Asset binaries are still excluded from conversion.

This applies to newly created Projects.
