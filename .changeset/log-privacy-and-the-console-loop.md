---
'@elek-io/core': minor
---

Stop Core's log files carrying things they should not, and stop the logger feeding itself.

Three fixes, all in what Core writes down. They matter now because a log file is about to become attachable to a bug report, and none of it was safe to send.

**Upgrading a Project no longer logs what you wrote.** The upgrade path logged every entity file whole, before and after, at `info`. An Entry file carries every authored Value in every language, so anyone who had upgraded had their content sitting in a log file. It now records the versions it moved between, and for an Entry the number of Values and their field slugs. Git history already holds the real before and after at the exact commit, which is a better record than a log line ever was.

**Project names are out of the log files too.** `elek provision` wrote the Project's name into Core's log; it writes the id now. A name buys a log reader nothing, since the id resolves to the object the moment the repository is on hand, and it is the one part of a line that reads as somebody's words. Build output from the Astro integration is unchanged and still names the Project it read, because that is your own terminal and never goes into a file.

**Git commands no longer carry your name and email.** Core logs each command it runs, and three of them put your identity on the command line: the `--author` of every commit, and the two `git config --local user.*` writes. They are redacted now. Credentials embedded in a remote URL go the same way. Ids, paths and flags are untouched, since those are what make a log line worth reading.

**A broken pipe cannot take the process with it any more.** Both log transports handled uncaught exceptions, including the console. So a console write that failed became a new uncaught exception, which was written to the console again. In an Astro build whose stdout had closed, that ran at 5450 records a second for thirteen minutes. Only the log file handles exceptions now, because the sink it writes to is not the one that failed.

Alongside it, `log.hasProcessErrorHandlers` controls whether Core registers process-level `uncaughtException` and `unhandledRejection` handlers at all. It defaults to `true`, which is what Core has always done, so nothing changes unless you ask it to. `@elek-io/core/astro` now sets it to `false`, because inside a build the host owns the process.

Two smaller things came with it. A git command taking 100ms or more was logged as a warning, which on Windows and Intel macOS meant every clone, merge and LFS transfer during entirely normal operation. Duration is recorded as a value now instead of deciding the severity. And `log`'s settings are individually optional, so pinning one no longer forces you to pin the other.
