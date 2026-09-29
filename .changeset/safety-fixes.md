---
'@elek-io/core': minor
---

Fixed five safety bugs. Three concern what leaves a User's machine, one concerns what the local API is reachable from, and one breaks a generated file.

**The local API binds loopback only.** `LocalApi.start()` passed no `hostname`, so `@hono/node-server` bound every interface and anything on the network could read every local Project through an API that called itself local. It now binds `127.0.0.1`, and the startup line names the address it actually bound instead of asserting `localhost`. There is deliberately no option to widen it.

**A relative markdown link can no longer resolve to another origin.** `mdAstLinkUrlSchema` rejected `//evil.com` but accepted `/\evil.com`, and an embedded tab, LF or CR did the same thing, because `new URL()` normalises all four into a protocol-relative URL:

```ts
new URL('/\\evil.com', 'https://example.com').href; // https://evil.com/
```

The shape check stays, and `new URL()` is now the oracle behind it: a relative URL has to keep the origin it was resolved against. Pattern matching is what let the first one through, so the fix does not add the missing characters to the regex.

This is the one change that can reject content that validated before. A stored Entry holding such a link in a `markdown` Value now fails to parse on read, so the Entry does not open rather than the link becoming inert. Editing the link in the source file is the remedy. The URLs affected are the ones that were resolving somewhere other than where they appeared to.

**A failed git command no longer carries the User's identity.** `CoreError.internal` was built from the raw argument list and raw `stderr`. Git echoes an offending argument back, so a failed `commit --author=` or `config --local user.name` put a name and email into the message, `logBoundaryError` wrote it at `error`, and a report sent with `hasLogConsent` shipped it to elek.io Cloud. `push()` and `rebase()` had the same defect.

The message now carries the redacted command and the exit code. What git printed moves to the error's `cause`, which is thrown but never logged:

```ts
catch (error) {
  if (error instanceof CoreError) {
    error.message; // the redacted command and the exit code
    error.cause; // what git actually printed
  }
}
```

Anything that showed `error.message` verbatim to a user shows less than it did. The local API already serves `err.cause.stack`, so the diagnostic survives. Redacting `stderr` in place was rejected because git's output is localised, so matching on English phrasing is already broken on a German or Japanese machine.

**A file that will not parse no longer quotes itself into a log.** V8 puts a window of the input into its own `JSON.parse` message, and for a short entity file that window is authored content. `CoreError` now names the path, and V8's text moves to `cause`. The type is unchanged.

**A newline no longer breaks the generated types file.** `escapeForSingleQuotedString` escaped the quote and the backslash only, so a line break reached a single-quoted TypeScript literal verbatim and ended the line rather than the string. Three free-form inputs reach it: a textarea `defaultValue`, a string select's `option.value` and `ofAssetMimeTypes`.

The log privacy sweep now drives failure paths as well as service calls, which is why the git leak survived the previous sweep. A git command that fails, a file that will not parse and a schema that rejects all run with a User-typed string in play.
