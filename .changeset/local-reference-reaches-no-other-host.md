---
'@elek-io/core': minor
---

The local API's reference page at `GET /` loads nothing from another host and sends nothing to one, so it works with no network and talks only to the machine Core runs on.

**Core serves the Scalar bundle itself**, from the new `GET /reference/scalar.js`. The page used to pull it from jsDelivr, which left it blank offline and told a CDN that somebody had opened it. The bundle comes from an exactly pinned `@scalar/api-reference` that the build copies into `dist/node/reference/`, with the notice of its MIT license beside it. Nothing new is installed with Core, and nothing else about the package changed.

**The page requests no font from Scalar**, because Scalar's typefaces are only served from `fonts.scalar.com`. With them switched off it renders in Scalar's font stack, which falls through to the system's own typefaces unless the machine has Inter and JetBrains Mono installed.

**The Developer Tools bar and Ask AI are gone.** The bar's Share and Register buttons and the agent both upload the OpenAPI document to Scalar, and the agent read Scalar's registry as soon as it was opened. Scalar's request proxy is off too, so a test request goes straight to the API or not at all.

**A test request reaches the API again.** The OpenAPI document's `port` server variable carried a number, which OpenAPI does not allow, so the reference left `{port}` in the server URL and Test Request threw `Failed to construct 'URL': Invalid URL` instead of sending. It is a string now. The request goes to `http://localhost:31310`, the port both `core.api.start()` and `elek api:start` default to, so open the reference at that address and on that port.
