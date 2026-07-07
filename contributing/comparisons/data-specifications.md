# Data Specification Comparison

elek.io Core's object shapes (Projects, Collections, Components, Entries, Values) are defined as hand-written Zod schemas rather than built on a published data specification. This doc surveys the recognized specifications that could in principle serve as that foundation and asks one question for each: would it be a better fit than the current home-brewed setup, especially for relational data.

The short answer is no single specification is a better foundation, and the survey validates Core's design rather than undermining it. Every serious candidate lands on **borrow** or **reject**, none on **replace**. The reason is structural and recurs throughout: the specs that "natively model relational data" all assume a database, a server, or a global index, which is the one thing Core deliberately does not have.

This doc is a contributor and design reference, not consumer documentation. It records why Core does not adopt these specs so the decision does not get re-litigated, and it lists the specific ideas worth borrowing.

The doc is structured for quick scanning: the [summary](#summary-at-a-glance) gives the verdict per spec, the [comparison tables](#comparison) put the candidates side by side on the axes that matter, the [per-specification reference](#per-specification-reference) holds the detail, and [where Core stands](#elekio-core-where-it-stands) closes with what is already standards-aligned, what is genuinely Core's own, and what to borrow.

For the field-type comparison against other CMS platforms, see [`fields.md`](./fields.md). For Core's own design, see [`../../docs/concepts.md`](../../docs/concepts.md), [`../../docs/references.md`](../../docs/references.md), and [`../../docs/storage-layout.md`](../../docs/storage-layout.md).

## What "fit" means here

Two distinct layers are in play, and most specs only touch one:

- **Schema-definition layer** - how the content model itself is described. In Core this is a Collection's or Component's `fieldDefinitions` array. Candidates: JSON Schema, GraphQL SDL, SHACL, OData EDM, Frictionless Table Schema, CUE.
- **Instance layer** - how a single Entry's data is shaped on disk. In Core this is the `values` record under a shared file envelope. Candidates: JSON-LD, JSON:API, RDF, Frictionless Data Resource, Portable Text.

A Core `fieldDefinition` deliberately fuses both data validation (types, `min`/`max`, `options`, MIME allowlists) and UI/authoring metadata (translatable `label`, `inputWidth`, `isDisabled`, `isRequired`). Most schema specs model only the data half, so they would describe less than half of what a `fieldDefinition` carries.

Verdicts use four levels:

- **replace** - worth adopting as the new foundation. Nothing reached this level.
- **adopt** - worth adopting for one layer (schema or instance).
- **borrow** - keep Core's foundation, take specific conventions, vocabulary, or an export target.
- **reject** - a worse fit than what Core already has, even ignoring migration cost.

## Summary at a glance

- **JSON Schema 2020-12** - The closest standard for the validation half, but it cannot express Core's cross-field refinements (`min <= max`, slug idempotency, default-in-options), so adopting it as the source of truth means keeping Zod and adding a second validator. Real win: **export** a derived schema for non-TS consumers, which `@hono/zod-openapi` already makes nearly free. Verdict: **borrow**.
- **JSON-LD 1.1 + Schema.org** - Unordered arrays, IRI ceremony, and zero referential integrity make it a poor storage format, but Core's per-language record already is a JSON-LD `@container: @language` map. Real win: an optional Schema.org **export** for SEO. Verdict: **borrow**.
- **RDF + SHACL / ShEx** - Triples have no document boundary and no canonical text form, the opposite of one diffable file per object. Open-world semantics means a dangling pointer is not even a violation. Borrow SHACL's constraint vocabulary only. Verdict: **reject** as a foundation.
- **JSON:API 1.1** - A transport spec for database-backed HTTP APIs. Resource identifiers may not carry the `collectionId` Core needs, and it has no i18n, ordering, or embedded-reference support. Borrow the typed `{objectType, id}` identity discipline, which Core already follows. Verdict: **borrow**.
- **OData v4 (EDM)** - A foreign-key and inverse-partner relationship model, the opposite of Core's one-way references. Borrow the `principal`/`dependent` and cascade-vs-restrict vocabulary to document delete semantics. Verdict: **borrow**.
- **GraphQL SDL** - Name-keyed, where Core is UUID-keyed by design, and no slot for UI metadata except directive soup. Emit it as a generated projection for a future query API. Verdict: **borrow**.
- **Frictionless Data (Table Schema, Data Package)** - Tabular and SQL-flavored. Collapsing a Collection into rows destroys the per-file git history. Good **export** target and a clean `foreignKey`/`constraints` vocabulary to align with. Verdict: **borrow**.
- **Portable Text** - A flat array faking nesting with string conventions, assuming Sanity's resolver, baking editor keys into the document. A strictly worse fit than Core's mdast. Verdict: **reject**.
- **Sanity reference convention** - Bare `_ref` works only with a global index Core lacks, so Core's `collectionId`-carrying pointer is the correct no-database shape. The main idea it surfaces, **weak vs strong** references, was considered and deferred (see [Considered and deferred](#considered-and-deferred)). Verdict: **borrow** (confirms Core's array-of-typed-pointers model is already industry-standard).
- **Keystatic** - The closest git-backed peer, but it models less than Core (slug-string refs with no integrity, no native i18n). Worth a comparison row to show Core's model is the deliberate, stronger choice. Verdict: **borrow**.

## Comparison

### By role and verdict

| Specification | Family | Role it would play | Verdict |
| --- | --- | --- | --- |
| JSON Schema 2020-12 | Schema / validation | Schema layer | borrow |
| JSON Type Definition (RFC 8927) | Schema / validation | Schema layer | reject |
| OpenAPI 3.1 Schema Object | Schema / validation | Export only | borrow |
| JSON Forms / RJSF uiSchema | UI schema | UI metadata layer | borrow |
| CUE | Schema / constraint language | Schema layer | borrow |
| JSON-LD 1.1 + Schema.org | Linked data | Instance + export | borrow |
| RDF (Turtle / N-Triples) | Linked data | Instance / foundation | reject |
| SHACL / ShEx | Linked data validation | Schema layer | borrow (vocabulary) |
| JSON:API 1.1 | Resource / API | Instance format | borrow |
| OData v4 (EDM) | Resource / API | Schema layer | borrow |
| GraphQL SDL | Resource / API | Schema layer / projection | borrow |
| HAL / HAL-FORMS, Hydra | Hypermedia | Instance format | reject |
| Frictionless Table Schema / Data Package | Tabular dataset | Schema + export | borrow |
| CSV on the Web (CSVW) | Tabular dataset | Export only | borrow |
| Prisma schema, SQL DDL | Relational DSL | Conceptual reference | borrow (ideas) |
| LinkML, Dublin Core | Modeling / metadata | Conceptual reference | borrow (ideas) |
| Portable Text | Rich text | Body instance format | reject |
| ProseMirror, Lexical, ADF, Slate | Rich text | Body instance format | reject |
| mdast / unist | Rich text | Body instance format | already adopted |
| Sanity reference convention | CMS pattern | Relation model | borrow |
| Keystatic | Git-backed CMS | Peer pattern | borrow |

### Relational modeling

The headline question. How each candidate models a relation, and whether that transfers to Core's no-database, file-per-object layout.

| Specification | Relation mechanism | Integrity it provides | Inverse / M2M | Fit for Core's no-DB model |
| --- | --- | --- | --- | --- |
| **elek.io Core (today)** | Per-language array of typed pointers `{objectType, id, collectionId}` | Existence, `ofCollections`, MIME, `min`/`max`, enforced by file scan at write / delete / sync | One-way only, no inverse, no M2M object | n/a (the baseline) |
| JSON Schema | `$ref` is schema reuse, not a data relation | None at the data level | None | Adds nothing relational |
| JSON-LD / RDF | `@id` node links, triples | None (open-world) | Inverse via owl, but no integrity | Needs a triplestore to enforce anything |
| SHACL | `sh:node` / `sh:class` target shapes | Closed-world needs the whole graph loaded | Declares, does not store | Pushes toward the DB Core avoids |
| JSON:API | `relationships` with resource identifiers | None (transport only) | To-many yes, inverse no | Identifier may not carry `collectionId` |
| OData EDM | Navigation properties, referential constraints | FK-style, server-enforced | Inverse `Partner`, yes | Inverse model is the opposite of one-way |
| GraphQL SDL | Typed fields, resolved by a server | Resolver-backed, not declarative | Bidirectional by convention | No resolver, no server, no DB |
| Frictionless | Column-to-column `foreignKey` | Row-value validation against a target column | Junction tables | Tabular, breaks per-file storage |
| Sanity | `{_ref, _type}`, weak vs strong | Server-enforced delete blocking | Junction docs (userland) | Bare `_ref` needs a global index |
| Keystatic | Bare slug string | None (renames silently break) | Single-collection only | Weaker than Core already is |

The pattern is consistent. Specs that declare rich relations (OData, GraphQL, Frictionless, SHACL) assume an engine that resolves and enforces them. Specs that are pure serialization (JSON:API, JSON-LD) declare the shape but provide no integrity. Core already implements the integrity by scanning files, so no spec relieves the part that is actually hard. See [`../../docs/references.md`](../../docs/references.md) and [`../../src/service/ReferenceService.ts`](../../src/service/ReferenceService.ts).

### The recurring reason specs do not fit

Five Core constraints break most candidates, and they break them the same way each time:

1. **No database, one diffable file per object.** Triples (RDF), rows (Frictionless), and query-service envelopes (OData, JSON:API) all lose the human-readable git diff that is Core's reason to exist.
2. **First-class i18n.** Every direct, reference, and mdast value is a per-language partial record keyed by BCP-47. Almost no general spec models this, so translations get stuffed into opaque attributes where the spec adds nothing.
3. **Polymorphic composition.** The `dynamic` field embeds an ordered array of component items inside a value. Flat attributes-vs-relationships models (JSON:API) and unordered arrays (JSON-LD) cannot represent it without exploding one Entry into many files.
4. **References inside values.** A reference can live in a flat field, inside an mdast body node, or nested in a component block. Specs that model relations only at the top level cannot see the nested two-thirds.
5. **Integrity is the enforced part, not the declared part.** Core's value is the write / delete / sync file scan, which no schema vocabulary touches.

## Per-specification reference

### Schema-definition and validation

- **JSON Schema (Draft 2020-12)** - The most capable standard for the validation half. Per-type constraints map natively (`minLength`/`maxLength`, `minItems`/`maxItems`, `enum`, `pattern`, `format`), and unknown keywords are tolerated as annotations, so UI metadata could sit beside the data types. It cannot express predicates that relate one instance value to another (`min <= max`), compute a canonical form (slug idempotency), or read sibling field definitions (`ofFieldDefinitions`), which is exactly the work [`../../src/schema/fieldSchema.ts`](../../src/schema/fieldSchema.ts) and [`../../src/schema/schemaFromFieldDefinition.ts`](../../src/schema/schemaFromFieldDefinition.ts) do. Adopting it as the source of truth yields two validators to keep in lockstep, strictly worse than today's single Zod source. Core already derives JSON Schema from Zod via `@hono/zod-openapi`, so the right move is to export it, not invert the flow. Verdict: borrow.
- **JSON Type Definition (RFC 8927)** - Deliberately minimal, built for codegen. Its tagged-union `discriminator` fits the unist node `type` and the reference pointer shape tidily, but it cannot restrict map keys to an enum (so a translatable record becomes an open string-keyed map, weaker than `z.record(z.enum(languages), ...)`) and has no value constraints at all. The canonical docs site has lapsed. Verdict: reject.
- **OpenAPI 3.1 Schema Object** - A superset alignment of JSON Schema 2020-12 used for API description. Core already produces it through `.openapi()`. Value is as a published artifact for consumers, not as a model. Verdict: borrow (export).
- **JSON Forms and RJSF uiSchema** - Dedicated UI-schema layers that pair a JSON Schema with a separate presentation document. The split is the opposite of Core's deliberate fusion of data and UI metadata in one `fieldDefinition`, but the idea is a useful reference if the UI metadata ever needs to travel separately from validation. Verdict: borrow (idea).
- **CUE** - A typed configuration language where types and values unify, doing schema, constraints, defaults, and generation in one place. More expressive than JSON Schema on cross-field constraints, so it is the one general schema language that could in principle host Core's refinements. It is a language and toolchain, not a JSON-document spec, and it would replace Zod's TypeScript inference story, which is a hard requirement for Core's consumers. Worth knowing as the serious schema-layer alternative. Verdict: borrow (idea), evaluate later.

### Linked data and semantic web

- **JSON-LD 1.1 + Schema.org** - As a schema layer it is a non-starter, because Core's model is fully user-defined and Schema.org is a fixed vocabulary with no home for UI metadata. As an instance format it fights ordering (arrays are unordered by default), integrity (none), and diff size (`@context`/`@type`/`@value` envelopes bloat every leaf). One slice aligns genuinely: the per-language record is a `@container: @language` map. Best used as an optional SEO export. Verdict: borrow.
- **RDF (Turtle / N-Triples / N-Quads)** - An unordered triple set with no document boundary and no canonical text form. Comparing two graphs needs blank-node canonicalization, the antithesis of reading a diff. Ordered structures Core relies on are second-class. Verdict: reject as storage.
- **SHACL / ShEx** - The closest W3C standard to what Core home-brews on the constraint side, and the mapping is real (`isRequired` to `minCount`, `min`/`max` to counts, `select` to `sh:in`, `ofCollections` to `sh:class`/`sh:or`). It gives no TypeScript types, no default synthesis, no per-field mdast narrowing, and no vocabulary for the UI half, so it cannot replace Zod. Open-world semantics also means a dangling reference is not a violation by default, the opposite of what Core needs. Borrow the names. Verdict: borrow (vocabulary).
- **Hydra, ActivityStreams 2.0** - Hypermedia and social-activity vocabularies on top of JSON-LD. Out of domain for a content model. Verdict: reject.

### Resource and API relational

- **JSON:API 1.1** - Designed for HTTP APIs over a database. Four Core constraints break it: resource identifiers must not carry extra members (but entry refs need `collectionId`), no i18n, relationships are one linkage per name with no ordering, and references embedded inside values cannot be expressed without exploding the Entry. It also describes only instances, leaving the larger schema layer homeless. The one durable idea is modeling every cross-object pointer as a typed `{objectType, id}` identifier, which Core already does. Verdict: borrow (discipline), reject as storage.
- **OData v4 (EDM + CSDL)** - A foreign-key and inverse-partner relationship model with referential constraints. Core's references are one-way typed pointer objects with `collectionId` for path resolution, not association keys, so EDM's strengths point the wrong way. Instance JSON is built for a query service (`@odata.bind`, `@odata.context`) and is hostile to clean git files. Borrow the `principal`/`dependent` and cascade-vs-restrict vocabulary to document Core's existing delete behavior, and `NavigationPropertyBinding` as a framing for `ofCollections`. Verdict: borrow (vocabulary).
- **GraphQL SDL** - An API type system, not a content-model language or a serialization format. It is name-keyed, but Core is UUID-keyed precisely so a Collection or field can be renamed without rewriting instances. Roughly half a `fieldDefinition` is UI metadata SDL can only carry as custom directives. Its relational power is resolver-and-server-backed, which Core does not have. The right direction is the inverse: emit a generated `.graphql` projection of the model for a future query API. Verdict: borrow (projection).
- **HAL / HAL-FORMS, Hydra** - Hypermedia link formats for navigable APIs. No schema layer, no i18n, no integrity. Out of domain. Verdict: reject.

### Tabular and dataset relational

- **Frictionless Data (Table Schema, Data Package, Data Resource)** - The clearest standardized `foreignKey` in the survey, declared at the schema level and checked by validating row values against a target column. It is tabular, so as an instance format it would collapse a Collection into one multi-row table and destroy per-file git history, and it models no i18n, polymorphism, or mdast. As a schema layer it sees only the data half. It is an excellent export target (one Tabular Data Resource per Collection, references as id columns with declared `foreignKeys`, lossiness documented) and a clean `constraints` vocabulary to align names with. Verdict: borrow (export + vocabulary).
- **CSV on the Web (CSVW)** - Annotates CSV with a JSON metadata descriptor including foreign keys. Same tabular mismatch as Frictionless, narrower. Export only. Verdict: borrow (export).
- **Prisma schema, SQL DDL** - Relational DSLs assuming a relational engine. Useful only as a conceptual reference for what a real foreign-key model looks like. Verdict: borrow (ideas).
- **LinkML, Dublin Core** - LinkML is a modeling language that compiles to JSON Schema, SHACL, and more, worth knowing if a single source model ever needs many output formats. Dublin Core is a 15-term metadata vocabulary, usable as an export annotation for Project or Collection metadata. Verdict: borrow (ideas).

### Headless CMS peers

- **Contentful** - Content model plus entries as API JSON, links as typed `{sys: {type: 'Link', linkType, id}}` references resolved by the platform. Database-backed and API-first, so the storage shape does not transfer, but the typed-link convention echoes Core's typed pointers.
- **Sanity** - Schema types in code, documents in a hosted Content Lake, references as `{_ref, _type}` with a weak-vs-strong axis, and Portable Text for rich text. The bare `_ref` works only because a global index resolves any id, which is why Core's `collectionId`-carrying pointer is the correct no-DB shape. M2M is a userland junction-document pattern, which Core already supports with a normal join Collection. The one idea it surfaces is weak vs strong references, considered and deferred (see [Considered and deferred](#considered-and-deferred)).
- **Strapi** - Content types plus components and dynamic zones, database-backed. Validates Core's polymorphic-blocks-via-shared-Components design. See [`fields.md`](./fields.md).
- **Directus** - Wraps an existing SQL database, so relations are real DB foreign keys and M2M junctions, and i18n is a translations junction collection. The opposite storage model from Core.
- **Payload CMS** - Code-first config, the strongest typed relationship model among the CMS peers (polymorphic `relationTo` arrays, virtual `Join` fields). Its read-time-only virtual join is the right framing for a future Core back-reference feature.
- **Keystatic** - The closest git-backed peer. Schema is code-only (`keystatic.config.ts`, compiled at build time, not runtime-editable), which removes Core's central feature of end users authoring the content model. Relationship fields store a bare mutable slug string, single-collection, with no integrity (renames silently break). No native i18n. It models less than Core on exactly the axes the user cares about, which makes it good contrast material. Add a Keystatic row to [`fields.md`](./fields.md).
- **TinaCMS, Decap / Netlify CMS** - Git-backed, Markdown or config-driven, with reference-only relations and no back-references. Already covered for fields in [`fields.md`](./fields.md). Weaker relational models than Core.

### Rich-text and document models

- **mdast / unist** - The spec Core already uses for `markdown` bodies. A neutral unified/remark standard with genuine recursive block nesting and a large tooling ecosystem. Core adds typed `entryReference`/`assetReference` nodes and strips parser `position` for clean diffs. The survey confirms this was a well-founded choice. See [`../../docs/markdown-content.md`](../../docs/markdown-content.md).
- **Portable Text** - A flat array that fakes nesting with `level`/`style`/`listItem` strings, lossy for the long-form content Core targets. References use `{_type: 'reference', _ref}` plus `markDefs`/`_key` indirection that assumes a Sanity resolver and splits a reference away from the text it annotates. It pushes validation to the editor and renders unknown blocks gracefully, the opposite of Core's reject-on-write `features` allowlist. Tables and footnotes are not even native. A strictly worse fit than mdast. Verdict: reject. Two ideas worth noting: a `markDefs`-style shared-definition table only if profiling shows real duplication, and a documented forward-compat policy where a renderer degrades on an unknown node type instead of throwing.
- **ProseMirror, Lexical, ADF, Slate** - Editor-specific document models. They carry editor state and identity that Core deliberately strips, and they tie the storage format to one editor. mdast stays the better neutral choice. Verdict: reject as storage.

### Adjacent specifications the layered question under-weights

The "which schema spec" framing misses dimensions that matter more for Core's actual requirements. These came out of a completeness pass and are the most useful part of the survey for deciding what to change while still in alpha.

- **CRDTs (Automerge, Yjs)** - The most architecturally consequential omission. Core lists offline and multi-machine git sync as first-class, but relies on git's line-based merge of JSON, which conflicts badly on concurrent edits to the same Entry, especially reference arrays and `dynamic`-zone ordering. CRDTs are the recognized local-first merge foundation for exactly this. A merge and storage model, not a content-model schema, so it composes with the rest.
- **EAV / Datalog (Datomic) and the property-graph model (ISO GQL, openCypher)** - The two recognized non-SQL, non-RDF answers to first-class bidirectional references and true many-to-many without a relational engine. Reverse references, Core's documented gap, fall out for free. The right mental model for a reverse-index-computed-on-read feature that never gets stored, preserving the one-way on-disk invariant.
- **ICU MessageFormat + CLDR, and XLIFF 2.x** - i18n is first-class in Core, yet the value model stores a flat `{en, de}` record with no plural categories, gender, message interpolation, or translation state (untranslated / needs-review / translated). ICU/CLDR is the recognized model for grammatical variation, and XLIFF's source-vs-target-with-state is the missing piece if a translation workflow ever matters.
- **URN / IRI (RFC 8141) and JSON Pointer / JSON Patch (RFC 6901 / 6902)** - Core stuffs locating info (`collectionId`) into the reference because a bare UUID is not resolvable to a file. A URN scheme (`urn:elekio:entry:<collection>:<uuid>`) would make every pointer one self-describing string, decoupling identity from file layout. JSON Pointer is the standard grammar for addressing into a document (including per-language sub-values), and JSON Patch is the standard way to express the `coreVersion` migration chain declaratively instead of as imperative code.
- **EDTF (ISO 8601-2)** - A low-risk superset of the ISO 8601 Core already uses, adding uncertain, approximate, and partial dates ("circa 1920", "June 2026", open-ended ranges) that real content needs. Worth deciding before the date value model freezes.
- **Git LFS / git-annex** - The established convention for keeping large binaries out of git history via content-addressed pointers. Core already uses Git LFS for Assets. Its asset reference `{objectType: 'asset', id}` is conceptually an LFS-style content pointer. See [`../../docs/storage-layout.md`](../../docs/storage-layout.md).

## elek.io Core: where it stands

### Already standards-aligned

Core is more standards-based than the "home-brewed" label suggests. It already adopts mdast/unist (rich text), BCP-47 (languages), ISO 8601 (dates), RFC 3986 (slugs), E.164 (telephone), SemVer (versions), and Git LFS (assets), and a JSON Schema or OpenAPI artifact is one derivation away through `@hono/zod-openapi`. What is genuinely home-brewed is the file envelope and the `fieldDefinition` layer, which is precisely the part no general spec models well.

### What is genuinely Core's own, and correctly so

- The typed pointer `{objectType, id, collectionId}` is the correct shape for a no-database git layout. A bare `_ref` or `@id` would force either a global index Core avoids or a full scan per read.
- File-scan referential integrity at write, delete, and sync is the enforced part no schema vocabulary provides, and it stays correct against content merged in by a sync that never passed a write path.
- Per-language value records make i18n first-class without junction tables or per-locale entry copies.
- mdast bodies with typed reference nodes keep rich text structured and integrity-checked.

### What to borrow

| Borrow | From | What it is | Effort |
| --- | --- | --- | --- |
| Derived JSON Schema / OpenAPI export | JSON Schema, OpenAPI | Publish a schema artifact for the file envelopes so non-TS consumers can validate Project files. | Small, already on the stack |
| Constraint vocabulary alignment | JSON Schema, Frictionless | Name Core's constraints after `minimum`/`maximum`, `minItems`/`maxItems`, `enum`, `pattern`, `format` where they coincide. | Small, naming only |
| Schema.org JSON-LD export | JSON-LD, Schema.org | Optional structured-data output for published Entries (SEO), with an opt-in per-Collection type mapping. | Medium, export path |
| Delete-semantics vocabulary | OData EDM | Document Core's block-while-referenced as restrict and whole-Collection co-delete as a scoped cascade plus restrict. | Small, docs only |
| Reverse-index / back-reference framing | EAV, property-graph, Payload Join | If back-references ship, compute the inverse on read, never store it, to preserve the one-way on-disk invariant. | Design input |
| Keystatic comparison row | Keystatic | Add the closest git-backed peer to [`fields.md`](./fields.md) to show Core's typed-reference, integrity, and i18n model is a deliberate differentiator. | Small, docs |

### Considered and deferred

- **Weak vs strong references (Sanity)** - A per-field-definition `weak` flag that would exempt a present pointer from the write, delete, and sync integrity gates, so a reference is allowed to dangle. Considered and deferred. It is orthogonal to `isRequired`, which governs whether a field may be empty, not whether a present pointer may dangle, so it is not already covered by an optional field. Its one unique capability is tolerating a dangling pointer, most usefully deleting a target without first editing every referrer. That cuts against Core's integrity-first design, where a blocked delete returns a structured `Conflict` listing the referrers to fix, which is better than a silently broken link. The create-order cases (mutually referencing Entries, arbitrary-order import) are better served by a deferred-validation import mode than by weakening the reference type permanently. Revisit only if a concrete editor workflow makes blocking-delete-until-cleanup too painful.
- **Translation state (ICU/CLDR, XLIFF)** - A per-language status (machine, needs-review, approved) plus source-change provenance on each translatable value. Considered and deferred, and it is not a value-format lock-in. The planned translation flow keeps a human proof-reading every machine result before it is applied, which collapses the machine-vs-human and review-vs-approved distinctions that justify state, and the untranslated case is already derivable from an absent or `null` language key. That flow also needs no Core change at all: the translate button writes into the existing per-language record. The one capability state would add is staleness detection (the `settings.language.default` source edited after a translation was made), which needs persisted per-language source provenance the current records cannot derive. If it is ever wanted it belongs in an additive sidecar (`fieldSlug + language -> { state, sourceHash }`), never nested into the value leaf, so the value records stay compact and diffable. Revisit only if staleness nudges or a draft/approve workflow become a product goal.

### What to reject, and why

- **RDF / SHACL as a foundation** - unordered triples vs diffable files, open-world vs file-scan integrity, no UI metadata vocabulary, and it would require materializing the whole project as a graph, the database Core refuses.
- **Portable Text instead of mdast** - flat structure, resolver assumption, editor keys in the document, no native tables or footnotes.
- **JSON:API / OData / GraphQL / Frictionless as the storage format** - all assume a server, database, or query engine, and all lose the per-file git diff, the i18n records, or the embedded references that define Core.

### Dimensions worth a decision before alpha freezes

Ordered by leverage. Note that genuine value-format lock-ins are rarer than they first appear: translation state, for example, turned out to be an additive sidecar rather than a leaf change (see [Considered and deferred](#considered-and-deferred)), so the only true now-or-never items are the ones that reshape an on-disk value.

1. **CRDT-backed sync** for concurrent edits, the single most consequential gap for the offline and multi-machine requirement.
2. **The relational gap** (back-references and many-to-many), already documented in [`../../docs/features.md`](../../docs/features.md), modeled as read-time computed inverses rather than stored ones. Additive, so not a format lock-in.
3. **Reference identity** (a URN scheme) and **migrations as JSON Patch**, both lower lock-in risk and adoptable later.
4. **EDTF dates**, a cheap superset to decide on before the date value model freezes.

## See Also

- [`fields.md`](./fields.md) - field-type comparison against Strapi, Directus, Payload, and TinaCMS
- [`../../docs/concepts.md`](../../docs/concepts.md) - the data model these specs are weighed against
- [`../../docs/references.md`](../../docs/references.md) - how Core enforces referential integrity without a database
- [`../../docs/storage-layout.md`](../../docs/storage-layout.md) - the file-per-object layout on disk
- [`../../docs/markdown-content.md`](../../docs/markdown-content.md) - why rich text is stored as an mdast tree
- [`../../docs/features.md`](../../docs/features.md) - capabilities and current limitations, including the relational gaps
