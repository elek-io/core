# CMS Field Type Comparison

Comparison of content field types across CMS platforms, with elek.io Core's design situated against Strapi, Directus, Payload CMS, and TinaCMS.

The doc is structured for quick comparison: the [comparison tables](#comparison) put all five platforms side-by-side, the [per-CMS reference](#per-cms-reference) holds full per-platform detail, and [strengths and gaps](#elekio-core-strengths-and-gaps) closes with where elek.io Core leads and what it lacks.

For elek.io Core's full field reference and code examples, see [`../fields.md`](../fields.md).

## Summary at a glance

- **elek.io Core** - Git-backed JSON storage with first-class i18n. 6 value types × 17 field types. Strong on validated string types (`url`/`ipv4`/`telephone`), grid layout control (`inputWidth`), reusable Components composed via the polymorphic `dynamic` field, and structured (mdast) rich text via the `markdown` field. No M2M. Nested groups and nested `dynamic` fields are intentionally disallowed.
- **Strapi** - Simplest field model. Good basics but fewest UI-layer options. Unique UID field for slug generation. Components + Dynamic Zones for composition.
- **Directus** - Most granular. Clean separation of data types from UI interfaces gives maximum flexibility. Strongest in presentation/layout fields, geospatial, and selection widgets. Best for database-first projects.
- **Payload CMS** - Developer-centric with code-first config. Strongest typed relationship model (polymorphic + virtual joins). Monaco code editor built-in. Best React integration for custom fields.
- **TinaCMS** - Minimalist core (8 documented types) extended via UI plugins. Git-backed Markdown storage makes it unique. Best for static sites and content stored in repos. Weakest relationship support (reference only, no back-references).

## Comparison

All comparison tables put **elek.io Core first** so the reader scans rightward to see how each competitor handles the same row.

### Field Type Coverage

| Category          | elek.io Core                                  | Strapi                            | Directus                                 | Payload CMS                     | TinaCMS                   |
| ----------------- | --------------------------------------------- | --------------------------------- | ---------------------------------------- | ------------------------------- | ------------------------- |
| **Text (short)**  | `text`                                        | Text                              | Input                                    | Text                            | String                    |
| **Text (long)**   | `textarea`                                    | Text (long)                       | Textarea                                 | Textarea                        | String + `textarea` UI    |
| **Rich Text**     | `markdown` (mdast tree)                       | Blocks + Markdown                 | WYSIWYG (HTML) + Markdown + Block Editor | Rich Text (Lexical/Slate, JSON) | Rich Text (Markdown AST)  |
| **Number**        | `number`                                      | Number (int/float/decimal/bigint) | Input (int/float/decimal/bigint)         | Number                          | Number                    |
| **Boolean**       | `toggle`                                      | Boolean                           | Toggle                                   | Checkbox                        | Boolean                   |
| **Date/Time**     | `date` / `time` / `datetime` (separate types) | Date (date/time/datetime)         | Datetime                                 | Date                            | Datetime (ISO 8601 UTC)   |
| **Email**         | `email`                                       | Email                             | --                                       | Email                           | --                        |
| **URL**           | `url`                                         | --                                | --                                       | --                              | --                        |
| **Telephone**     | `telephone`                                   | --                                | --                                       | --                              | --                        |
| **IPv4**          | `ipv4`                                        | --                                | --                                       | --                              | --                        |
| **Password/Hash** | --                                            | Password (hashed, bcrypt)         | Hash (one-way)                           | --                              | Password (type)           |
| **Select/Enum**   | `select` (string & number)                    | Enumeration                       | Dropdown / Radio / Checkboxes            | Select / Radio                  | String/Number + `options` |
| **Range/Slider**  | `range`                                       | --                                | Slider                                   | --                              | --                        |
| **Color**         | --                                            | --                                | Color picker                             | --                              | String + `color` UI       |
| **Icon**          | --                                            | --                                | Icon picker                              | --                              | --                        |
| **Code**          | --                                            | --                                | Code editor                              | Code (Monaco)                   | --                        |
| **JSON**          | --                                            | JSON                              | `json` type (Code/List interfaces)       | JSON                            | --                        |
| **UID/Slug**      | --                                            | UID                               | --                                       | --                              | --                        |
| **Media/Image**   | `asset` (reference)                           | Media (single/multi)              | File / Image / Files                     | Upload                          | Image                     |
| **Geospatial**    | --                                            | --                                | Map (7 geometry types)                   | Point (GeoJSON)                 | --                        |
| **Tags**          | --                                            | --                                | Tags (CSV/JSON)                          | --                              | String + `tags` UI        |

### Relationship Models

| Relation Type                 | elek.io Core                                        | Strapi                  | Directus               | Payload CMS              | TinaCMS                            |
| ----------------------------- | --------------------------------------------------- | ----------------------- | ---------------------- | ------------------------ | ---------------------------------- |
| **Asset references**          | `asset` field (min/max)                             | Media                   | File / Image / Files   | Upload                   | Image                              |
| **Entry references**          | `entry` field (`ofCollections` + min/max)           | Relation                | M2O / O2M / M2M        | Relationship             | Reference                          |
| **Polymorphic (Many-to-Any)** | `ofCollections` (entry), `ofComponents` (dynamic)   | --                      | Yes (M2A)              | Yes (`relationTo` array) | Yes (multi-collection `reference`) |
| **One-to-One**                | Yes (via `min: 1`, `max: 1`)                        | Yes                     | Yes (M2O)              | Yes                      | --                                 |
| **One-to-Many**               | Yes (via `min`/`max`)                               | Yes                     | Yes (O2M)              | Yes                      | --                                 |
| **Many-to-One**               | -- (one-way refs only)                              | Yes                     | Yes (M2O)              | Yes                      | --                                 |
| **Many-to-Many**              | --                                                  | Yes                     | Yes (M2M via junction) | Yes                      | --                                 |
| **One-way / No back-ref**     | Yes (all references are one-way)                    | Yes (one-way, many-way) | --                     | --                       | --                                 |
| **Translations**              | Built into all direct values (`TranslatableString`) | --                      | Yes (specialized M2M)  | --                       | --                                 |
| **Reverse/Virtual Join**      | --                                                  | --                      | --                     | Yes (Join field)         | --                                 |

### Composite / Structural Fields

| Feature                | elek.io Core                                                                            | Strapi                   | Directus              | Payload CMS          | TinaCMS                  |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------ | --------------------- | -------------------- | ------------------------ |
| **Grouped fields**     | `FieldDefinitionGroup` (presentational, Collections only)                               | Component (single)       | Repeater (JSON)       | Group (keyed object) | Object (static `fields`) |
| **Repeatable groups**  | `dynamic` field referencing one Component                                               | Component (repeatable)   | Repeater (JSON array) | Array                | Object + `list: true`    |
| **Polymorphic blocks** | `dynamic` field (`ofComponents`)                                                        | Dynamic Zone             | Builder (M2A)         | Blocks               | Object + `templates`     |
| **Tabs**               | --                                                                                      | --                       | --                    | Tabs (Named)         | --                       |
| **Nesting**            | Components reusable across Collections, groups cannot nest, dynamic cannot nest dynamic | Components in components | --                    | Groups in groups     | Objects in objects       |

### Presentation / Layout-Only Fields

| Feature                   | elek.io Core                 | Strapi | Directus                       | Payload CMS        | TinaCMS |
| ------------------------- | ---------------------------- | ------ | ------------------------------ | ------------------ | ------- |
| **Field grouping**        | `FieldDefinitionGroup`       | --     | Accordion / Detail / Raw Group | Collapsible / Tabs | --      |
| **Grid/width control**    | `inputWidth` (12/6/4/3 grid) | --     | --                             | Row                | --      |
| **Section headers**       | --                           | --     | Header                         | --                 | --      |
| **Dividers**              | --                           | --     | Divider                        | --                 | --      |
| **Collapsible sections**  | --                           | --     | Accordion, Detail Group        | Collapsible        | --      |
| **Horizontal rows**       | --                           | --     | --                             | Row                | --      |
| **Notices/alerts**        | --                           | --     | Notice                         | --                 | --      |
| **Button/links**          | --                           | --     | Button Links                   | --                 | --      |
| **Custom UI slot**        | --                           | --     | --                             | UI (custom React)  | --      |
| **Tabs (presentational)** | --                           | --     | --                             | Tabs (Unnamed)     | --      |
| **Unstyled grouping**     | --                           | --     | Raw Group                      | --                 | --      |

### Architectural Differences

| Aspect                      | elek.io Core                                                  | Strapi                      | Directus                                               | Payload CMS                                | TinaCMS                                             |
| --------------------------- | ------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| **Data storage**            | JSON files (Git-backed)                                       | Database                    | Database (wraps existing DB)                           | Database                                   | Markdown/MDX files (Git-backed)                     |
| **Rich text output**        | Structured mdast tree (JSON)                                  | HTML or structured blocks   | HTML or JSON blocks                                    | Structured JSON (Lexical/Slate)            | Markdown AST                                        |
| **UI/data separation**      | Partially decoupled (`valueType` vs `fieldType`)              | Coupled (field = UI + data) | Decoupled (28 data types, 40+ interfaces)              | Coupled with component overrides           | Decoupled (8 core types, UI plugins)                |
| **i18n approach**           | Built into every direct value, narrowed to `ProjectLanguages` | Built-in core, locale-based | Specialized M2M                                        | Locale config                              | --                                                  |
| **Schema validation**       | Zod schemas generated from field definitions                  | Config-based                | Database introspection                                 | Config-based                               | Config-based                                        |
| **Extensibility model**     | Code-level schema definitions (no plugin system)              | Marketplace plugins         | Extension SDK (interfaces, displays, layouts, modules) | Custom React components via config         | Custom React components via `ui.component`          |
| **Virtual/computed fields** | --                                                            | --                          | --                                                     | Any field with `virtual: true`, Join field | --                                                  |
| **Field count**             | 17 field types across 6 value types                           | ~14 built-in                | 40+ interfaces on 28 data types                        | ~18 data fields + presentational + Join    | 8 documented core types (10 in source) + UI plugins |

## Per-CMS Reference

Full per-platform field-type detail. Use this section to look up one CMS in depth - the [comparison tables](#comparison) above are the right starting point for cross-platform comparison.

### Strapi

#### Regular Fields

| Field Type           | Description                                                                                                                                                   | When to Use                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Text                 | Small text input. Short text (max 255 chars) or long text.                                                                                                    | Titles, descriptions, slugs, and other brief textual content.                                                           |
| Rich Text (Blocks)   | Live-rendering block editor supporting formatted text, images, code blocks, and more. Pairs with `Strapi Blocks React Renderer` on the frontend.              | Long-form content like articles, blog posts, or documentation where structured rich content is needed.                  |
| Rich Text (Markdown) | Simpler editor with basic formatting using Markdown syntax. Less feature-rich than Blocks.                                                                    | Long-form content when Markdown is preferred, e.g. developer-facing content or lightweight markup.                      |
| Number               | Supports integer, big integer, decimal, and float formats. Configurable min/max values.                                                                       | Quantities, prices, measurements, ratings, or any numeric value.                                                        |
| Date                 | Three modes: date (year/month/day), time (hour/minute/second), or datetime (both).                                                                            | Scheduling, timestamps, publication dates, event times.                                                                 |
| Email                | Text input with built-in email format validation.                                                                                                             | Contact info, user emails, newsletter signups - anywhere a validated email address is needed.                           |
| Password             | Hashed text field (bcrypt, one-way). Stored as a hash, not retrievable in plaintext.                                                                          | Storing sensitive credentials securely.                                                                                 |
| Boolean              | Toggle for true/false values. Default can be true, false, or null.                                                                                            | Feature flags, published/draft status, yes/no toggles, visibility switches.                                             |
| Enumeration          | Predefined list of values shown as a dropdown. Values must start with alphabetical characters for GraphQL compatibility.                                      | Status fields, categories, fixed option sets (e.g. "draft/published/archived").                                         |
| JSON                 | Stores arbitrary JSON objects or arrays.                                                                                                                      | Flexible/unstructured data, metadata, configuration objects, or complex nested data that doesn't fit other field types. |
| UID                  | Generates a unique identifier, optionally derived from another field. Ensures uniqueness.                                                                     | URL slugs (e.g. auto-generating a slug from a title field).                                                             |
| Media                | Select one or multiple files from the Media Library (images, videos, documents). Two modes: single media or multiple media. Can restrict allowed media types. | Hero images, galleries, file attachments, video embeds.                                                                 |

#### Relational Field

| Field Type | Description                                                                 | When to Use                                                                                 |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Relation   | Establishes relationships between content types (must be collection types). | Linking content types together - categories to articles, authors to posts, tags to entries. |

Supported relation types:

| Relation Type | Description                      | Example                                             |
| ------------- | -------------------------------- | --------------------------------------------------- |
| One-way       | A has one B (no back-reference)  | A post has one thumbnail                            |
| One-to-one    | A has and belongs to one B       | A user has one profile, profile belongs to one user |
| One-to-many   | A belongs to many B              | A category has many articles                        |
| Many-to-one   | B has many A                     | Many articles belong to one author                  |
| Many-to-many  | A has and belongs to many B      | Articles have many tags, tags have many articles    |
| Many-way      | A has many B (no back-reference) | A post references many related posts                |

#### Composite / Structural Fields

| Field Type   | Description                                                                                                                                                                       | When to Use                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Component    | Reusable group of fields bundled together. Can be single (one instance per entry) or repeatable (multiple instances per entry). Components can be nested inside other components. | Structured, reusable content blocks like SEO metadata (title + description + image), address blocks (street + city + zip), or feature cards.                                   |
| Dynamic Zone | Flexible container that accepts multiple different component types. Content editors can add, remove, and reorder components freely at runtime.                                    | Page builders, flexible layouts, or any content where the structure varies per entry (e.g. a landing page made of hero + features + testimonials + CTA sections in any order). |

#### Extensibility

| Field Type    | Description                                                                                                                              | When to Use                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Custom Fields | Third-party or self-built fields installed via the Strapi Marketplace. Each custom field can define its own basic and advanced settings. | Specialized needs not covered by built-in types (e.g. color pickers, map coordinates, industry-specific data types). |

### Directus

Directus has a layered system: **data types** (how values are stored in the database) and **interfaces** (how users interact with fields in the UI). A single data type can be presented through different interfaces. There are 28 underlying data types (`TYPES` in `@directus/constants`, of which 6 are `geometry.*` subtypes) and over 40 interfaces in total.

#### Regular Fields

##### Text & Input

| Field Type         | Interface ID             | Description                                                                                               | When to Use                                                                                            |
| ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Input              | `input`                  | Standard single-line input. Works with string, text, integer, float, decimal, bigInteger, and UUID types. | Default choice for most scalar fields - general-purpose text, numbers, or UUIDs.                       |
| Textarea           | `input-multiline`        | Plain multi-line text input without formatting.                                                           | Longer text that doesn't need rich formatting (descriptions, notes, plain paragraphs).                 |
| WYSIWYG            | `input-rich-text-html`   | Rich text editor with toolbar, producing HTML output.                                                     | Formatted content with bold, italic, headings, links, embedded media - article bodies, marketing copy. |
| Markdown           | `input-rich-text-md`     | Markdown editor with edit/preview modes.                                                                  | Technical documentation or developer-facing text where Markdown is preferred over HTML.                |
| Block Editor       | `input-block-editor`     | Block-based editor (Notion/Gutenberg-style). Content stored as JSON blocks.                               | Flexible page/content composition with reusable, rearrangeable content blocks.                         |
| Code               | `input-code`             | Code editor with syntax highlighting (JSON, JS, HTML, CSS, etc.).                                         | Programming code, raw JSON, configuration snippets, any pre-formatted text.                            |
| Autocomplete (API) | `input-autocomplete-api` | Text input with dropdown populated from an external API endpoint.                                         | Dynamic suggestions from third-party services (address lookup, product search).                        |
| Hash               | `input-hash`             | Text input that one-way hashes the value on save. Original value cannot be retrieved.                     | Passwords, API keys, secrets - any sensitive data that should not be stored in plaintext.              |
| Tags               | `tags`                   | Input for adding multiple free-form tags. Stored as CSV or JSON.                                          | Keywords, categories, labels, or multiple short text values on a single field.                         |

##### Selection & Choice

| Field Type          | Interface ID                    | Description                                                                                     | When to Use                                                                                 |
| ------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Toggle              | `boolean`                       | Checkbox/switch for boolean values.                                                             | Simple on/off, true/false, yes/no settings.                                                 |
| Dropdown            | `select-dropdown`               | Select one value from a predefined list.                                                        | Mutually exclusive choice from a fixed set (status, priority, category).                    |
| Dropdown (Multiple) | `select-multiple-dropdown`      | Select multiple values from a predefined list. Stored as JSON array or CSV.                     | Multiple selections from a fixed set without a separate collection.                         |
| Checkboxes          | `select-multiple-checkbox`      | Multiple checkboxes for selecting several options.                                              | Multiple independent boolean-like choices displayed all at once.                            |
| Checkboxes (Tree)   | `select-multiple-checkbox-tree` | Nested, expandable/collapsible tree of checkboxes.                                              | Hierarchical category selection (nested taxonomy, permission trees).                        |
| Radio Buttons       | `select-radio`                  | Single-value selection with all options visible at once.                                        | When all options should be visible (not hidden in a dropdown) and only one can be selected. |
| Color               | `select-color`                  | Color picker supporting HEX, RGB, HSL with visual palette.                                      | Brand colors, theme settings, UI accent colors.                                             |
| Icon                | `select-icon`                   | Picker for Google Material Symbols icon library.                                                | Choosing icons for navigation items, categories, or UI elements.                            |
| Slider              | `slider`                        | Range input with interactive slider. Configurable min, max, step.                               | Numeric values within a bounded range (rating 1–10, opacity 0–100).                         |
| Datetime            | `datetime`                      | Date and/or time picker with calendar UI. Works with date, dateTime, timestamp, and time types. | Scheduling, event dates, publication dates, deadlines.                                      |

##### Geospatial

| Field Type | Interface ID | Description                                                                    | When to Use                                                                                         |
| ---------- | ------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Map        | `map`        | Interactive map for viewing/setting geospatial data (points, lines, polygons). | Location picking, drawing geographic boundaries, route mapping. Pairs with `geometry.*` data types. |

Supported geometry data types: `geometry`, `geometry.Point`, `geometry.LineString`, `geometry.Polygon`, `geometry.MultiPoint`, `geometry.MultiLineString`, `geometry.MultiPolygon`.

#### Relational Fields

| Field Type    | Interface ID          | Description                                                                                                    | When to Use                                                                                              |
| ------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Many to One   | `select-dropdown-m2o` | Dropdown to select one related item from another collection. Creates a foreign key.                            | Linking to exactly one item in another collection (article → author, city → country).                    |
| One to Many   | `list-o2m`            | Shows all items in another collection that reference the current item. Alias field.                            | Managing child records (author → articles, order → line items).                                          |
| Many to Many  | `list-m2m`            | Manages M2M relationships through a junction collection.                                                       | Bi-directional links (articles ↔ tags, students ↔ courses).                                              |
| Builder (M2A) | `list-m2a`            | Many-to-Any relationship - items can relate to items from multiple different collections via a junction table. | Page builders, flexible content blocks where each block can come from a different collection.            |
| Tree View     | `list-o2m-tree-view`  | Specialized O2M for self-referencing (recursive) relationships displayed as a tree.                            | Hierarchical structures within one collection (folder trees, org charts, nested menus, comment threads). |
| Translations  | `translations`        | Manages multilingual content through a languages collection and junction table.                                | Any content that needs to exist in multiple languages.                                                   |
| File          | `file`                | Upload/select a single file from the file library. Relates to `directus_files`.                                | Attaching a single document, PDF, or archive to an item.                                                 |
| Image         | `file-image`          | Upload/select a single image with optional cropping. Relates to `directus_files`.                              | Thumbnails, avatars, hero images, product photos.                                                        |
| Files         | `files`               | Upload/select multiple files via M2M junction to `directus_files`.                                             | Media galleries, document collections, multiple file attachments.                                        |

Supported relation types:

| Relation Type      | Description                                                                                                           | Example                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Many to One (M2O)  | Multiple items in A link to one item in B via foreign key.                                                            | Cities → Country, Articles → Author             |
| One to Many (O2M)  | Inverse of M2O. One item has many related children. Virtual alias field.                                              | Author → Articles, Country → Cities             |
| Many to Many (M2M) | Items in A and B linked through an auto-created junction collection.                                                  | Articles ↔ Tags, Students ↔ Courses             |
| Many to Any (M2A)  | One collection relates to items in any number of other collections. Junction stores both item ID and collection name. | Page builders with heterogeneous content blocks |
| Translations       | Specialized M2M variant with a languages collection. Each junction row holds translated values for one language.      | Any multilingual content                        |

#### Composite / Structural Fields

| Field Type                          | Interface ID                        | Description                                                                                    | When to Use                                                                                       |
| ----------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Repeater                            | `list`                              | Repeating group of sub-fields stored as a JSON array. Each entry has the same field structure. | Structured repeating data without a separate collection (FAQ items, pricing tiers, social links). |
| Collection Item Dropdown            | `collection-item-dropdown`          | Dropdown to select one item from any collection, stored as JSON (not a true relational link).  | Quick single-item reference stored as JSON without formal relational setup.                       |
| Collection Item Dropdown (Multiple) | `collection-item-multiple-dropdown` | Select multiple items from any collection, stored as JSON.                                     | Multiple item references as JSON without formal M2M junction tables.                              |

#### Presentation & Layout

These are alias fields - they store no data and are purely for organizing the edit form UI.

| Field Type   | Interface ID           | Description                                                                  | When to Use                                                                       |
| ------------ | ---------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Header       | `presentation-header`  | Section header with title, subtitle, help text, and optional action buttons. | Adding section titles, contextual guidance, or quick-action buttons within forms. |
| Divider      | `presentation-divider` | Horizontal line separator.                                                   | Visually separating field sections without nesting or grouping.                   |
| Button Links | `presentation-links`   | Styled buttons that trigger Directus Flows or open hyperlinks.               | Quick actions, external links, workflow triggers embedded in the form.            |
| Notice       | `presentation-notice`  | Alert/notice banner for information, warnings, or tips.                      | Drawing attention to important info, warnings, or instructions.                   |

#### Groups

Alias fields that visually group other fields together.

| Field Type   | Interface ID      | Description                                                    | When to Use                                                                                     |
| ------------ | ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Accordion    | `group-accordion` | Expandable/collapsible group, only one section open at a time. | Space-efficient organization with many fields that don't all need to be visible simultaneously. |
| Detail Group | `group-detail`    | Show/hide a sub-group by clicking the header.                  | Conditional or secondary fields editors may not always need (advanced settings, SEO fields).    |
| Raw Group    | `group-raw`       | Groups fields with no visible border or styling.               | Logical organization for layout purposes without visual chrome.                                 |
| Tab Group    | `group-tabs`      | Groups fields into selectable tabs (core since v11.17.1).      | Splitting a long form into tabbed sections within a single item.                                |

#### System

| Field Type | Interface ID | Description                                                    | When to Use                                                 |
| ---------- | ------------ | -------------------------------------------------------------- | ----------------------------------------------------------- |
| System     | `_system`    | Internal interface used by Directus for its own system fields. | Not for user use - internal to Directus system collections. |

#### Extensibility

Directus supports custom interfaces, displays, layouts, modules, panels, and hooks via its Extension SDK. Custom interfaces can be built to create entirely new field editing experiences beyond the 40 built-in interfaces.

### Payload CMS

Payload has three field categories: **data fields** (store data in the database, all have a `name` property), **presentational fields** (organize/present fields in the Admin Panel, no data stored), and **virtual fields** (computed or derived, not persisted in the database). Additionally, any data field can be made virtual by adding `virtual: true` to its config.

#### Data Fields

##### Text & Input

| Field Type | Description                                            | When to Use                                                                         |
| ---------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Text       | Simple single-line text input. Saves a string.         | Titles, names, slugs, and other short textual content.                              |
| Textarea   | Multi-line text input. Saves a string.                 | Longer plain text like descriptions, summaries, bios.                               |
| Email      | Text input with built-in email format validation.      | Contact info, user emails - anywhere a validated email address is needed.           |
| Number     | Numeric input. Saves a number.                         | Prices, quantities, ratings, measurements, or any numeric value.                    |
| Code       | Code editor interface (Monaco editor). Saves a string. | Code snippets, HTML embeds, configuration, or any syntax-highlighted content.       |
| JSON       | JSON editor interface. Saves a JSON object.            | Arbitrary structured data, configuration objects, metadata, or complex nested data. |

##### Selection & Choice

| Field Type | Description                                                                            | When to Use                                                                        |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Checkbox   | Toggle input. Saves a boolean (`true`/`false`).                                        | Feature flags, published/draft status, yes/no toggles, visibility switches.        |
| Select     | Dropdown/picklist. Saves one or multiple predefined string values. Supports `hasMany`. | Choosing from a known set of options (e.g. status, category, priority).            |
| Radio      | Radio button group. Saves a single string value.                                       | Same as Select but when all options should be visible at once (small option sets). |

##### Date & Location

| Field Type | Description                                                                                                             | When to Use                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Date       | Date picker. Saves a timestamp.                                                                                         | Publish dates, event dates, deadlines, scheduling.       |
| Point      | Saves geographic coordinates in GeoJSON format. Supports geo-queries with automatic indexing (not supported on SQLite). | Location data, maps, store locators, geospatial queries. |

##### Rich Content

| Field Type | Description                                                                                                                  | When to Use                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Rich Text  | Fully extensible rich text editor (Lexical default; Slate adapter deprecated in 3.x, removed in 4.0). Saves structured JSON. | Long-form formatted content - blog posts, articles, documentation, page content. |

#### Relational Fields

| Field Type   | Description                                                                                                                                      | When to Use                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Relationship | References documents in other collections. Supports polymorphic relationships (multiple collections via `relationTo` array) and `hasMany`.       | Linking content together - post → author, product → category, article → tags.            |
| Upload       | References documents in upload-enabled collections. Can reference multiple upload collections. Essentially a specialized relationship for files. | Attaching files, images, videos, or documents. Hero images, galleries, file attachments. |

#### Composite / Structural Fields

| Field Type   | Description                                                                                      | When to Use                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group        | Nests fields under a single keyed object in the database.                                        | Organizing related fields together - e.g. grouping `street`, `city`, `zip` under an `address` key.                                                       |
| Array        | Repeating sets of fields where every row has the same schema. Supports drag-and-drop reordering. | Lists of structured items with identical shape - sliders, FAQ items, team members, navigation links.                                                     |
| Blocks       | Array of objects where each object is a "block" with its own distinct schema.                    | Flexible/mixed content - page builders, layout builders, form builders. Each block type (e.g. `Hero`, `CallToAction`, `Gallery`) defines its own fields. |
| Tabs (Named) | Like Group, but renders fields in a tabbed layout. Saves data under a keyed object.              | Same use as Group, but when you want a tabbed editing experience to reduce visual clutter in complex forms.                                              |

#### Presentational Fields

These are layout-only fields - they do **not** have a `name` property and store no data in the database.

| Field Type     | Description                                                                | When to Use                                                                                                            |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Collapsible    | Wraps fields in a collapsible/expandable section.                          | Hiding less-used fields to reduce visual clutter (e.g. "Advanced Settings", "SEO fields").                             |
| Row            | Arranges fields horizontally side-by-side.                                 | Placing fields next to each other (e.g. first name + last name on one row).                                            |
| Tabs (Unnamed) | Displays fields in tabs without storing data under a key. Data stays flat. | Organizing the admin UI into tabs purely for presentation.                                                             |
| UI             | Blank field slot for completely custom React components.                   | Adding custom UI elements - buttons, previews, instructions, visualizations - anything not covered by built-in fields. |

#### Virtual Fields

| Field Type | Description                                                                                                                                | When to Use                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Join       | Achieves two-way data binding by querying the reverse side of a Relationship or Upload field. No data is stored - it queries at read time. | Viewing all documents that reference the current document - e.g. on an Author, show all their Posts. Avoids data duplication. |

Note: Any data field can also be made virtual by setting `virtual: true`, allowing computed or derived fields to appear in API responses without being persisted.

#### Extensibility

Payload supports fully custom field types through its component-based architecture. Any field's admin UI can be swapped with a custom React component via the `admin.components` config. Custom server-side validation, hooks, and access control can be added to any field.

### TinaCMS

TinaCMS has a layered system: **8 documented core schema field types** (set via the `type` property) define how data is stored, while **UI component plugins** (set via `ui.component`) control how those types render in the editor without changing the underlying data type. (The schema source actually defines 10 `type` literals - the 8 documented ones plus `password` and `displayOnly`.) All content is stored as Markdown/MDX files with frontmatter.

#### Data Fields

##### Text & Input

| Field Type | Description                                                                                                                                                                                                                   | When to Use                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| String     | Short-form plain text. Supports `list: true` for arrays and `options` for predefined value sets (renders as dropdown or checkboxes). `isTitle: true` marks it as the display title for collection items in the CMS list view. | Titles, descriptions, slugs, and other brief textual content without formatting. |
| Number     | Numeric values (integers or decimals). Supports `list: true` and `options` like String.                                                                                                                                       | Quantities, prices, sort orders, ratings, measurements.                          |
| Boolean    | True/false toggle switch.                                                                                                                                                                                                     | Feature flags, published/draft state, visibility toggles, any on/off setting.    |
| Datetime   | Date/time values in ISO 8601 format (UTC). Configurable via `ui.dateFormat` and `ui.timeFormat`. Uses `react-datetime` under the hood. Values are persisted as UTC, converted from the user's local time on input.            | Publication dates, event times, scheduling, timestamps.                          |

##### Rich Content

| Field Type | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                               | When to Use                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Rich Text  | Full Markdown/MDX editor with formatting toolbar. Stores content as a Markdown AST. Supports `isBody: true` to save content to the Markdown body section (below frontmatter). `templates` enables embedding custom React/MDX components. Toolbar buttons can be controlled via `overrides.toolbar` (heading, link, image, quote, ul, ol, bold, italic, code, codeBlock, mermaid, table, raw, embed); related overrides include `showFloatingToolbar` and `headingLevels`. | Blog post bodies, long-form content, documentation - any content that needs formatting. |

##### Media

| Field Type | Description                                                                                                                                                                                                         | When to Use                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Image      | Dedicated file input that stores the URL or path of an uploaded image. Supports drag-and-drop upload, a built-in media manager, and external media providers (Cloudinary, S3). Supports `list: true` for galleries. | Featured images, thumbnails, hero banners, gallery items. |

#### Relational Fields

| Field Type | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | When to Use                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Reference  | Creates a relationship link from one document to another document in a specified collection. Requires `collections` array to specify which collections can be referenced (supports multiple). Querying the parent document returns the full data of the referenced document. Cannot be set as `list: true` directly - wrap in an Object field with `list: true` instead. Supports `ui.collectionFilter` for filtering options and `ui.optionComponent` for custom rendering. | Linking a blog post to an author, associating a product with a category, any cross-document relationship. |

#### Composite / Structural Fields

| Field Type | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | When to Use                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Object     | Groups multiple fields into a nested structure. Two modes: **fields** (static shape - all instances have the same sub-fields) and **templates** (polymorphic blocks where the user picks from different shapes, stores a `_template` discriminator key). Supports `list: true`, `ui.visualSelector` for visual block picking with preview images, `ui.itemProps` for custom list item labels, `ui.defaultItem` for presets, and `ui.min`/`ui.max` constraints on list item count. | Grouping related fields (SEO metadata, address blocks), creating repeatable content blocks, page builder sections. |

#### UI Component Plugins

These change how a core type renders in the editor (set via `ui.component`). They do not change the stored data type - only the editor widget.

| Component     | Base Type                                | Description                                                                                                                             | When to Use                                                                                  |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `textarea`    | String                                   | Multi-line text area.                                                                                                                   | Longer plain text like bios, descriptions, summaries.                                        |
| `select`      | String / Number                          | Dropdown selector. Auto-rendered when `options` is set without `list`.                                                                  | Choosing from a predefined set of options.                                                   |
| `radio-group` | String / Number                          | Radio button group. Supports `direction` (horizontal/vertical) and `variant` (radio/button).                                            | When all options should be visible at once (small option sets).                              |
| `tags`        | String (with `list: true`)               | Tag input for multiple free-form values. Stored as string array.                                                                        | Keywords, labels, multiple short text values.                                                |
| `color`       | String                                   | Color picker. Supports `colorFormat` (hex/rgb), `colors` (preset swatches), `widget` (sketch for full picker, block for swatches only). | Brand colors, theme settings, UI accent colors.                                              |
| `toggle`      | Boolean                                  | Toggle switch with custom labels via `toggleLabels`.                                                                                    | When the default boolean toggle needs labeled states (e.g. "On"/"Off", "Active"/"Inactive"). |
| `hidden`      | Any                                      | Removes the field from the editor UI entirely. Data is still stored.                                                                    | Internal/computed values that should not be user-editable.                                   |
| `list`        | Any (with `list: true`)                  | Generic list input.                                                                                                                     | Default rendering for list fields.                                                           |
| `group`       | Object                                   | Grouped field container (default for Object).                                                                                           | Default rendering for single Object fields.                                                  |
| `group-list`  | Object (with `list: true`)               | List of grouped fields (default for Object lists).                                                                                      | Default rendering for Object list fields.                                                    |
| `blocks`      | Object (with `list: true` + `templates`) | Block-based page builder. Each template has its own fields, defaultItem, and itemProps.                                                 | Flexible page builders, mixed content layouts.                                               |
| `date`        | Datetime                                 | Date picker.                                                                                                                            | Default rendering for Datetime fields.                                                       |
| `markdown`    | Rich Text                                | Raw Markdown editor (external plugin, requires separate import).                                                                        | When a raw Markdown editing experience is preferred over the WYSIWYG editor.                 |
| `html`        | Rich Text / String                       | HTML code editor (external plugin, requires separate import).                                                                           | When content needs to be authored as raw HTML.                                               |

#### Common Field Properties

These properties are available on every field definition:

| Property       | Type                      | Description                                                                                      |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `name`         | string (required)         | Field identifier. No spaces, dashes, or special characters. Must be unique among siblings.       |
| `type`         | string (required)         | One of the 8 core types: string, number, boolean, datetime, image, reference, object, rich-text. |
| `label`        | string                    | Display name in the editor. Defaults to `name`.                                                  |
| `description`  | string                    | Help text shown below the field in the editor.                                                   |
| `required`     | boolean                   | Disables save while field is empty.                                                              |
| `list`         | boolean                   | Stores an array of values instead of a single value.                                             |
| `nameOverride` | string                    | Controls the key name used in the content file (can differ from the GraphQL name).               |
| `options`      | array                     | Restricts values to a predefined set (scalar types only). Renders as dropdown or checkboxes.     |
| `ui.component` | string or React component | Override the default editor widget with a UI component plugin.                                   |
| `ui.validate`  | function                  | Custom validation. Return error message string or null.                                          |
| `ui.parse`     | function                  | Transform data before saving to the content file.                                                |
| `ui.format`    | function                  | Transform data before displaying to the user.                                                    |
| `ui.min`       | number                    | Minimum items for list fields.                                                                   |
| `ui.max`       | number                    | Maximum items for list fields.                                                                   |
| `isTitle`      | boolean                   | Marks field as collection display title (String only).                                           |
| `isBody`       | boolean                   | Saves field to Markdown body section below frontmatter (String/Rich Text only).                  |

#### Notable Absences

TinaCMS has no dedicated email, URL, or generic file (non-image) field type. For those use cases, use String with a custom `ui.component`. It does have a `password` field type and a read-only `displayOnly` field type in source, though both are lightly documented.

#### Extensibility

TinaCMS supports custom field components by passing a React component directly to `ui.component` on any field definition. This allows building entirely custom editing experiences while using the core schema types for data storage.

## elek.io Core: Strengths and Gaps

### Strengths

- **Built-in i18n** - Every direct value is multilingual by default via `TranslatableString`, translated per field inline. This differs architecturally from Strapi (whole entry duplicated per locale, even though i18n is now core in v5) and Directus (a translations junction collection): no junction tables or per-locale entry copies, just the value carrying every language. Validation is narrowed to project-configured languages via `ProjectLanguages`.
- **Dedicated validated types** - `url`, `telephone`, `ipv4` are standalone field types with built-in validation, where other CMS platforms rely on generic text + custom validation.
- **Polymorphic blocks via shared Components** - The `dynamic` field with `ofComponents` lets editors compose flexible page layouts from a curated catalog of reusable Components, avoiding the inline-block-schema duplication that other platforms require.
- **Grid layout control** - `inputWidth` (12/6/4/3) provides a simple but effective 12-column grid for field layout, comparable to Payload's Row field but more granular.
- **Strong type safety** - Zod-based schema generation from field definitions provides rigorous runtime validation, comparable to Payload's approach and more rigorous than Strapi/Directus.
- **Git-backed storage** - Similar to TinaCMS's approach but using structured JSON instead of Markdown, combining version-control benefits with structured data.
- **Structured rich text** - The `markdown` field stores a typed mdast tree rather than an HTML or markdown string, making Asset and Entry references first-class typed nodes and letting any framework render content its own way.

### Gaps

| Gap                         | Who Has It                               | Priority                                                  |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| **Back-references / Joins** | Strapi, Directus, Payload                | Medium - Limits complex relational modeling.              |
| **Many-to-Many**            | Strapi, Directus, Payload                | Medium - No formal junction table support.                |
| **JSON / Arbitrary data**   | Strapi, Directus, Payload                | Medium - Useful for metadata, config, unstructured data.  |
| **Code editor**             | Directus, Payload                        | Low - Niche, mainly for developer-facing content.         |
| **Color picker**            | Directus, TinaCMS, Strapi (custom field) | Low - Nice-to-have for theming/branding fields.           |
| **Password/Hash**           | Strapi, Directus, TinaCMS                | Low - Typically handled at auth layer, not content layer. |
| **Geospatial**              | Directus, Payload                        | Low - Specialized use case.                               |

The lack of nested composition (no nested groups, no nested `dynamic` fields) is **intentional design** - Components are the reuse mechanism, kept flat to keep the data and editor model predictable - not an unmet need.

## See Also

- [`../fields.md`](../fields.md) - elek.io Core's full field reference and code examples
- [`../features.md`](../features.md) - Core's capabilities and current limitations
- [`../concepts.md`](../concepts.md) - the data model the field system describes
