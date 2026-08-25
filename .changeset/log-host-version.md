---
'@elek-io/core': minor
---

Add the `log.hostVersion` option, so the records an application logs through Core can say which build of it wrote them.

```ts
const core = new ElekIoCore({ log: { hostVersion: '0.3.4' } });

core.logger.error({ source: 'desktop', message: 'Uncaught error: ...' });
// resource: { 'service.name': 'desktop', 'service.version': '0.3.4', ... }
```

`service.version` was previously set only on Core's own records, because Core cannot read the version of a host that logs through it. That left a gap: a record an application logged carried nothing but `service.name` and the platform, so a log file handed over on its own could not be matched to a build. A report carries the application's version in its body, but somebody who zips `<dataDir>/logs` and mails it sends no body.

An application that declares nothing is unchanged. Those records stay unversioned rather than borrowing Core's version, which would read as a lie to whoever opens the file, and a declared version never reaches a record Core emitted.

The value must be a semantic version. A value that is not one throws a `CoreError` at construction, because `logRecordSchema` validates `service.version` on the way back in and an unparseable one would make every record of that run invisible to `core.logger.tail()`.
