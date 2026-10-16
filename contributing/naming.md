# Naming

Conventions for naming things in Core's source. The goal is that a name tells the reader what kind of value it holds and where it comes from.

## Boolean keys

Boolean properties and options read as predicates. Prefix them with `is`, or `has` when the value states possession.

Examples: `isReadOnly`, `isRequired`, `isUnique`, `isProvisioned`, `hasToken`.

## Exception: names that mirror an external tool

When a key maps directly to another tool's flag or option, keep that tool's name. The reader can then look the option up in the external documentation without translating it first.

- Git flags stay git-named: `create`, `detach`, `forceCreate`, `discardChanges`, `bare`, `squash`, `singleBranch`, `atomic` and `force` in the git schemas and options mirror the flags of `git switch`, `git clone`, `git merge`, `git push` and friends.
- Slug options mirror `@sindresorhus/slugify`: `lowercase` and `decamelize`.
- CLI options mirror the flag users type: `watch` mirrors `--watch`.
- mdast node fields mirror the mdast spec: `spread`, `checked`, `ordered`. Renaming these would break the external format.

## Other accepted shapes

- Feature toggles keep the feature name, because they read as "enable X": `cache`, and the markdown allowlist keys such as `tables` and `footnotes`.
- Generic keys shared across types keep their generic name even where the value happens to be boolean: `defaultValue` on a boolean field.
- Internal result fields may read as past-tense predicates: `wrote`, `changed`.

## Brand in identifiers

The company name is elek.io. The full brand appears only in global namespaces, where collision-safety and identity matter: the npm scope (`@elek-io`), environment variables (`ELEK_IO_*`) and the Core class (`ElekIoCore`). Everything else uses the bare brand `elek`: the CLI binary and every export of the astro entry (`elek()`, `elekEntriesLoader`, `defineElekConfig`).

The reasoning: these symbols arrive through an import from the scoped package, so the full brand is already on the same line. Repeating it in the symbol states the company twice, and the `elekIo` bigram misreads easily in camelCase. Precedent: Sanity.io ships `sanity()` from `@sanity/astro`, Snyk.io's CLI is `snyk`. Never write `elekIo*` in an identifier.

## Service namespaces on `core`

Every service hangs off `ElekIoCore` under a plural noun naming what it manages: `core.projects`, `core.collections`, `core.components`, `core.entries`, `core.assets`, `core.releases`, `core.references`. `core.git`, `core.user`, `core.api`, `core.logger` and `core.util` are singular because there is one of each.

The namespace is one level deep everywhere except `core.cloud`, and that exception is deliberate. elek.io Cloud is several APIs rather than one, so `core.cloud.reports` says which of them a call belongs to, and the Management and Publish surfaces get somewhere to land without a rename later. `CloudService` exists only to hold that level, it owns no behavior of its own.

The alternative was `core.reports`, flat like the rest. It was rejected because the next Cloud API would then sit beside it with nothing saying the two share a backend, an account and an outage.

### The account

The session Core signs in to hangs off `core.cloud.account`, singular because Core holds one session at a time. Why the names:

- `account` rather than `session`. `signUp()` creates the account and can answer no session at all, and verifying an address or resetting a password act on the account too. `session.signUp()` reads as creating a session.
- `signUp()`, `signIn()` and `signOut()` rather than the CRUD verbs. They are the words a sign in form and its reader use, and `create()` would not say whether it makes an account or a session.
- `read()` keeps the CRUD verb, because it reads the account of the session and changes nothing but a dead token.
- The sign up result's `outcome` is `session` or `verification`, one lowercase word each like Core's other enum values, naming what the caller has next.
- `hasToken` follows the boolean rule above.
- `onTokenChange()` takes the `on<Event>` shape of Node and DOM listeners and returns its own remover, so there is no `off` method to pair with it.

## Astro entry exports

Two conventions from the Astro ecosystem apply to `@elek-io/core/astro`:

- The integration is product-named, like every Astro integration (`react()`, `sitemap()`, `starlight()`): `elek()`, not `elekIntegration()`. Its position inside `integrations: []` states its kind.
- Loader factories carry the `Loader` suffix, like Starlight's `docsLoader` and the community loaders: `elekAssetsLoader()`, `elekEntriesLoader()`. The suffix separates them from functions that return collection definitions instead, like `elekCollections()`.
- Config helpers follow the `define*` convention of `defineConfig` and `defineCollection`: `defineElekConfig()`.

## Branches and channels

A Project has two branches, `projectBranchSchema`, and provisioning follows three channels, `contentChannelSchema`:

| Name | Kind | Holds |
| --- | --- | --- |
| `main` | branch | the released state, which only `core.releases.create()` moves |
| `draft` | branch and channel | every edit, and the channel that reads that branch |
| `release` | channel | the newest Release tag |
| `preview` | channel | the newest preview tag |

Why these names:

- Every git host points a new repository's default branch at `main`, and a plain `git clone` checks out the default branch, so released content is what the host and such a clone show. `core.projects.clone()` lands on `draft` instead, see [`releases.md`](./releases.md#where-a-clone-lands).
- `draft` is the branch and the channel that reads it, so nobody translates between the two. The Astro build log and the provisioning fallback warning print the branch name as is.
- `release` matches the word Desktop uses, Release, and the `Type: release` trailer of the tag it resolves to. `preview` likewise matches its tag type.
- `released` was the first pick and was rejected. `draft` and `preview` are nouns, so a participle is the odd one out, and making the set consistent would take `drafted` and `previewed`.

They replace `production` for the released branch and the channel, and `work` for the editing branch. The rename shipped without a migration, and the old names are refused like any unknown value. Do not add them back as aliases, because an alias keeps both vocabularies alive in every doc, error message and log line.

## See also

- [`documentation.md`](./documentation.md) - how to write about the things you just named
- [`astro-entry.md`](./astro-entry.md) - why the Astro entry exports carry the names they do
- [`linting.md`](./linting.md) - the rules a linter does check
- [`adding-a-field-type.md`](./adding-a-field-type.md) - the naming a new field type has to fit into
