---
'@elek-io/core': minor
---

Add `core.logger.tail()`, which reads the last 24 hours of log files back as one blob you can hand to someone else.

```ts
const tail = await core.logger.tail();
// { encoding: 'gzip+base64', from, to, isTruncated: false, data: 'H4sIAAAA...' }
```

It is on the logger rather than inside anything that sends it, because collecting diagnostics and sending them are two different things. A "save my diagnostics to a file" button needs the first and no network at all.

**What comes back is safe to share.** Core decides what it writes down at the call site, so its own records are already clean. What the tail adds is the short list a call site never saw: the home directory prefix becomes `~`, key names on Sentry's default denylist are dropped out of the `meta` an application logs through `core.logger`, and a git signature, a credential in a URL or an address anywhere in the text is redacted. Nothing is silently removed. What came out says what it was, and a record that changed carries `redaction.masked.count` and `redaction.redacted.count`, the two the OpenTelemetry Collector's redaction processor stamps, so a reader can tell a deliberate gap from an empty one.

**Ids, paths and timestamps stay exact.** They are not noise, they are the join: a tail plus the repository replays what happened, in order, with the commit for every step. Hashing or truncating an id would buy nothing and destroy that. Only the account name comes out of a path, and the structure below it is kept.

**A run of identical records collapses into one and a count.** This is what makes a tail small enough to attach. A measured day was 78 MB, and two thirds of it was a single stack repeating up to 5450 times a second. Collapsed it came to 0.04 MB, and 4 KB gzipped, without losing anything a reader needs. `elek.log.repeat.count` and `elek.log.repeat.last_timestamp` say how many there were and how long it ran. An ordinary day is 1 to 25 KB, so `isTruncated` is expected to stay `false`.

Records are read oldest first, streamed line by line and gunzipped on the way, so a very large file is never held in memory. Files a rotation never gzipped are read as they are, a half written last line is skipped rather than throwing, and a file that will not decompress gives up what it already read. A line is a record or it is nothing: `logRecordSchema` is the gate, so a log file written by a Core older than that shape is skipped rather than guessed at.

`logTailSchema` describes what `tail()` returns and is exported, along with the `LogTail` type.

Two limits worth knowing. winston has no per transport flush, so a tail collected immediately after a crash can be missing the last few lines, which are usually the interesting ones. `tail()` writes a marker and yields before reading to give the stream a chance to drain, but the gap is real. And a tail is personal data whatever it scrubs, because the ids in it resolve against the repository. Redaction lowers what it carries. It does not change what it is.
