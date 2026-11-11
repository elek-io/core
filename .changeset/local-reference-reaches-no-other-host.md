---
'@elek-io/core': minor
---

The local API's reference page at `GET /` loads nothing from another host and sends nothing to one, so it renders with every other host unreachable and talks only to the machine Core runs on.

**Core serves the Scalar bundle itself**, from the new `GET /reference/scalar.js`. The page used to pull it from jsDelivr, which left it blank offline and told a CDN that somebody had opened it. The bundle comes from an exactly pinned `@scalar/api-reference` that the build copies into `dist/node/reference/`, with the notice of its MIT license beside it. Installing Core brings no package it did not bring before, and the package grows by those two files and nothing else.

**The page requests no font from Scalar**, because Scalar's typefaces are only served from `fonts.scalar.com`. With them switched off it renders in Scalar's font stack, which falls through to the system's own typefaces unless the machine has Inter and JetBrains Mono installed.

**Scalar's Developer Tools bar and its Ask AI agent are gone.** Opening Ask AI read Scalar's registry over `api.scalar.com` before a reader had typed anything, and the agent's chat runs on Scalar's own service rather than on the machine. The bar's own Share, Register and Generate SDK buttons each work through an account on Scalar, which a local API has nothing to do with. Scalar's request proxy is off too, so a test request is sent straight to the address it names rather than through Scalar.

**The sidebar's Open API Client button is gone as well.** It opened `client.scalar.com` with the address of the reader's API in the query string, so clicking it told Scalar where a reader's API runs. The "Powered by Scalar" credit at the foot of the sidebar stays, and is the page's only link to scalar.com, which a reader has to click for anything to reach Scalar at all.

**A test request reaches the API again.** The OpenAPI document's `port` server variable carried a number, which OpenAPI does not allow, so the reference left `{port}` in the server URL and Test Request threw `Failed to construct 'URL': Invalid URL` instead of sending. It is a string now. The request goes to `http://localhost:31310`, the port `elek api:start` defaults to, so open the reference at that address and on that port.
