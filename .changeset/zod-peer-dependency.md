---
'@elek-io/core': minor
---

**Breaking:** `zod` is now a peer dependency instead of a bundled runtime dependency.

Core authors all of its schemas with zod v4, and zod v4 brands every schema with its
exact version. When Core shipped its own copy of zod, a consumer that installed a
different (even another 4.x) zod ended up with two physical copies, so a schema built
with Core's zod was not assignable to anything typed against the consumer's zod. This
broke downstream type-checking, for example feeding Core schemas into
`@hookform/resolvers`' `zodResolver`.

Declaring `zod` as a peer dependency means the consumer supplies the single shared
copy, so Core and the consumer always brand-match.

Migration: install a compatible zod alongside `@elek-io/core` and make sure it resolves
to a single copy.

```bash
npm install zod@^4.3.6
```

You still install zod yourself. As a convenience, Core also re-exports `z`, so in your
own code you can import it from `@elek-io/core` instead of from `zod` directly. It is the
same `z` with `@hono/zod-openapi`'s `.openapi()` extension:

```ts
import { z } from '@elek-io/core';

const mySchema = z.object({ title: z.string() }).openapi('MySchema');
```
