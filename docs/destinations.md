# Destinations

Where a Project's content goes, and what the place it goes to needs. A Destination is one such place, a website first. A Contract states what it needs, and a Mapping says which Project content fills it. This page covers generating a Contract from a Project, adding a website from its theme's git address, and asking what the website cannot take.

## Terms

| Term | What it is | Where it lives |
| --- | --- | --- |
| theme | The code a developer writes, which states a Contract | Its own git repository |
| Contract | What a theme needs, as Collections and Components | `elek.contract.json` in the theme, copied into the Project |
| website | The kind of Destination an editor adds, shown by its own name | The Project |
| Destination | One place content goes: its name, kind, Contract, version in use, Mapping and the newer version waiting for it | The Project |
| Mapping | Which Project Collection fills which Collection of the Contract, which of its Entries the website takes, and how each field is filled | Inside the Destination |

One theme runs many websites, and one Project keeps each Contract once however many Destinations follow it.

## A Contract

A Contract is a set of Collections and Components in Core's own schemas, plus a name, a version and the languages the theme serves. There is no second way to define a field, so every field type, constraint and validation rule a Collection has, a Contract has too.

```typescript
const contract = await core.contracts.generate({
  projectId: project.id,
  name: '@acme/dealer-site',
  version: '1.0.0',
});
```

- `collections` and `components` hold `collection.json` and `component.json` files as they are, ids and `coreVersion` included. Field definition ids are the identity a Mapping binds to.
- So a Contract carries every Collection's and Component's name, slug and description, each Collection's icon, and the labels, descriptions, default values and validation rules of their field definitions, in every language of the Project. No Entry, Asset or Value goes with it.
- Read it before it goes into a repository other people can see. A Collection named after one client, or a description written for the office, leaves the Project with it.
- `name` is a package-like name of lowercase words, optionally scoped as `@scope/name`.
- `languages` defaults to the Project's own supported languages, and `any` says the theme renders whatever the Project holds. It is recorded rather than checked, because which Project language fills a field is part of a Mapping.
- Every Collection and Component a field definition points at is included. A field definition naming one the Project does not hold throws `BadRequest` naming it, rather than writing a Contract whose references lead nowhere.

`generate()` writes nothing. Write it to the theme's repository as `elek.contract.json` with `elek generate:contract`, see [the CLI](./usage.md#the-cli).

## Keep the Project a Contract was generated in

Field definition ids are what a Mapping binds to, so recreating a Collection by hand gives every field a new id and fills nothing. Generate a theme's Contract from the Project it was built against, and keep that Project.

## Reading a theme's Contract

A theme releases a version by tagging it `v<version>`, such as `v1.2.0`, with an `elek.contract.json` carrying that same version.

```typescript
const theme = await core.contracts.readFromTheme({
  url: 'https://github.com/acme/dealer-site.git',
});
theme.version; // the newest version tagged there
theme.commit; // the commit the Contract was read from
```

- Without a `version` it takes the newest tagged one. A pre-release such as `v2.0.0-beta.1` is taken only when it is named.
- Core lists the tags, then fetches the one commit into a scratch repository under `tmp/`. Nothing is checked out and no Project is touched.
- `core.contracts.versionsFromTheme({ url })` lists every version tagged there, newest first, pre-releases included, without reading a Contract.
- It reads the address with your own git access, never with `ELEK_IO_REMOTE_ACCESS_TOKEN`, see [reading an address with your own git access](./git-and-sync.md#reading-an-address-with-your-own-git-access).

| What is wrong | What it throws |
| --- | --- |
| The address carries a credential, such as a password or a token, or git would run it as a command | `BadRequest` |
| The address is a path on this machine and not an absolute one | `BadRequest` |
| The address needs authentication you do not have | `Unauthorized` |
| The address cannot be read at all, because nothing is there or this machine cannot reach it | `Internal`, with the git command that failed on the `cause` |
| The address tagged no version | `PreconditionFailed`, reason `theme_without_version` |
| The version is not tagged there, or holds no `elek.contract.json` | `NotFound` |
| The `elek.contract.json` is no Contract, does not parse as JSON, or carries another version than its tag | `BadRequest` |

## Adding a website

```typescript
const website = await core.destinations.addWebsite({
  projectId: project.id,
  name: 'autohaus-ebersfelde.de',
  url: 'https://github.com/acme/dealer-site.git',
});
```

The CLI does the same in one command, which also prints what the website cannot take yet:

```bash
elek website:add --project <id> --name autohaus-ebersfelde.de --theme https://github.com/acme/dealer-site.git
```

Either way it reads the theme, keeps the Contract in the Project and writes the website, on the branch the Project is checked out on, which is `draft` for a working copy. That is a commit for the Contract, where the Project does not keep it yet, and one for the website. Synchronize the Project to take it to its remote.

A second website on the same address shares the Contract the Project already keeps rather than a copy of its own, and removing one leaves that Contract to the others.

- The Mapping starts out filling every field of the Contract whose id one of the Project's own field definitions carries, which is what a Contract generated from this Project gives. Nothing is guessed.
- A name another Destination of the Project already carries throws `Conflict`.
- `core.destinations.update()` replaces the Mapping, renames the website, or both. No version in use changes there. Whatever the Mapping leaves unfilled is saved, so an editor maps in steps, and it refuses a Mapping filling a Collection the Contract does not hold with `BadRequest`.
- `core.destinations.delete()` removes the website and leaves every Contract as it is.
- `core.contracts.keep()` puts a Contract into the Project under its own origin, which `addWebsite()` does for you. It refuses an address carrying a credential or one git would run as a command, the same way, because the origin is written into the Project.

A Project with no website behaves exactly as one did before Destinations existed, and `list()` and `count()` answer with nothing for a Project whose folders predate them.

## What a Mapping can do

A Mapping fills each field of the Contract in one of four ways, named by `fill`. Left out, `fill` reads as `field`, which is what a Mapping written before the other three existed fills by.

| `fill` | Fills the field from | Takes a `language` order |
| --- | --- | --- |
| `field` | one field definition of the Project, `fieldDefinitionId` | yes |
| `fixed` | `value`, a Value typed into the Mapping | no |
| `combined` | the `fieldDefinitionIds` joined by `separator` | yes |
| `options` | one field definition whose options are matched onto the Contract's | yes |

```typescript
await core.destinations.update({
  projectId: project.id,
  id: website.id,
  mapping: {
    collections: {
      [contractCarsId]: {
        from: { collectionId: vehicles.id, where: [] },
        fields: {
          [contractTitleId]: {
            fill: 'combined',
            fieldDefinitionIds: [make.id, model.id],
            separator: ' ',
          },
          [contractStatusId]: {
            fill: 'options',
            fieldDefinitionId: status.id,
            options: [{ from: 'for-sale', to: 'available' }],
          },
          [contractBodyId]: {
            fill: 'field',
            fieldDefinitionId: body.id,
            language: { order: ['de', 'en'] },
          },
        },
      },
    },
  },
});
```

The four ways in detail:

- A fixed `value` is a Value of the kind the field takes, in every language of the Project, and the field's own rules are read against it. A reference and Component items cannot be fixed, because their ids belong to one Project.
- `combined` joins the Values of two field definitions or more into one text per language, leaving out the ones holding nothing there. Its sources are the fields whose Value is text or a number, whatever kind of field that is, and the field it fills takes text.
- `options` matches each option of a `select` field onto an option of the Contract's own field, once in the Mapping rather than per Entry. An option without a match fills nothing.
- `language` takes the Value of the first language of `order` holding one and puts it into every language of the Project, which is how a theme serving one language takes what an editor wrote in another. Component items are not kept per language and are left as they are.
- `separator` defaults to a space, and a `language` order left out reads each language from itself.

## Which Entries a website takes

Each Collection of the Mapping takes the Entries meeting every condition under `from.where`, and all of them without one, which is what a Mapping written before conditions existed takes.

```typescript
from: {
  collectionId: vehicles.id,
  where: [{ fieldDefinitionId: status.id, equals: ['for-sale', 'reserved'] }],
},
```

- A condition is met by an Entry whose Value for that field definition is one of the ones it lists, in any language of the Project. An Entry holding none of them raises nothing in a check and reaches no site.
- It reads a field whose Value is text, a number or a toggle, whatever kind of field that is, a `select` among them. One on a field whose Value is of another kind, or on a field definition the Collection does not hold, takes no Entry at all and is reported.
- An Entry the website takes that points at one it leaves out is reported as `reference_not_taken`, because a page of it would link to something the website does not hold.
- Where two Collections of the Contract read one Collection of the Project and only one of them carries a condition, the website takes every Entry of it, because the other one takes them all.

## Asking what a website cannot take

```typescript
const issues = await core.destinations.checkAll({
  projectId: project.id,
  id: website.id,
});
```

`check()` takes one Entry by its `collectionId` and `entryId`, and `checkAll()` reads every Entry of every mapped Collection. Both answer with an array, empty when the website can take what it was asked about.

| `issue` | What is wrong |
| --- | --- |
| `collection_not_mapped` | No Collection of the Project fills a Collection the Contract names, or the Mapping fills it from a Collection the Project no longer holds |
| `field_not_mapped` | No field definition fills a required field of the Contract, or the Mapping fills it from a field definition its Collection no longer holds |
| `reference_not_mapped` | A mapped reference field points at a Collection of the Contract that nothing fills |
| `does_not_fit` | What fills a field cannot: a Value of another kind, a fixed Value the field refuses, fields joined into a field taking no text, a condition on a Value there is nothing to compare, or a Single Entry of the Contract filled from a Collection holding a list |
| `option_not_matched` | An option of the Project's field becomes no option of the Contract's, because nothing matches it, the match names an option one of the two does not hold, or the two fields are filled onto each other without matching |
| `missing_required` | The Entry holds no Value for a required field of the Contract |
| `constraint_violation` | The Entry's Value does not satisfy the Contract's field definition |
| `reference_not_taken` | The Entry points at one the website does not take |

- The first five are about the Mapping and come back whatever the Entries hold, so `checkAll()` reports each once, and `checkMapping()` reports them without reading an Entry at all.
- The last three name both sides: the Contract's field and the Project's own `collectionId`, `fieldDefinitionId` and `fieldSlug`, so an app can open the Entry at the field that raised it. One about a single language names it in `language`, a reference the website does not take included.
- The Mapping is read against the Collections the Project holds now. An entry of it naming a Collection or field definition that is gone fills nothing, so it is reported rather than taken as mapped, which is what a Project changing under a Mapping leaves behind.
- A field the Mapping fills in a way that cannot work is reported once as `does_not_fit` and left out of every Entry's check, so one wrong row of a Mapping is one issue rather than one per Entry.
- Values are read the way the Mapping fills them and against the Contract's own field definitions. An Entry reference is moved onto the Contract's Collection ids through the Mapping first, and one pointing into a Collection of the Project that fills nothing is refused, whatever the Contract's field allows.
- An Entry the website does not take raises nothing of its own, and neither does an optional field of the Contract nothing fills.
- A `dynamic` field is checked by the Components its items name, their count and whether one is there at all, never inside an item, because no Mapping maps a Component's own fields yet. A Value holding something other than Component items is refused, required or not.

The issues are spelled like the ones a field definition change raises, so an app words both the same way, see [`schema-changes.md`](./schema-changes.md#the-issues-an-update-reports).

## Checking a Mapping before it is saved, and the Values it fills

An app that lets an editor map a website checks the Mapping it is building, and shows the Value each field would take from one of the editor's own Entries, before any of it is saved.

```typescript
const issues = await core.destinations.checkMapping({
  projectId: project.id,
  id: website.id,
  mapping: edited,
});
const values = await core.destinations.values({
  projectId: project.id,
  id: website.id,
  contractCollectionId: contractCarsId,
  entryId: entry.id,
});
```

- `checkMapping()` answers what the Mapping given leaves the Contract without, the first five issues of the table above, and reads no Entry. It saves nothing, and throws `BadRequest` for a Mapping filling a Collection the Contract does not hold.
- `values()` answers one Entry's Values keyed by the field slugs of one Collection of the Contract, which is the shape a site reads. Every way of filling a field is applied, whether or not the website takes that Entry.
- A field of the Contract nothing fills is empty there rather than absent, so the shape is the Contract's whatever the Mapping holds.
- Both take `isWaitingVersion: true` for the version that waits beside the one in use.

## Creating a Collection or a field from the theme

A theme needs a Collection or a field the Project has nothing for, and the editor creates it from the theme rather than building it by hand. The Mapping fills itself with what was created.

```typescript
const website = await core.destinations.createCollection({
  projectId: project.id,
  id: website.id,
  contractCollectionId: contractCarsId,
});
await core.destinations.createFieldDefinition({
  projectId: project.id,
  id: website.id,
  contractCollectionId: contractCarsId,
  contractFieldDefinitionId: contractVinId,
});
```

- `createCollection()` writes the Collection the theme states, with the Components its `dynamic` fields need, and fills the Mapping with every field of it. `createFieldDefinition()` adds one field of the theme to the Collection of the Project filling its Collection, and fills that one row of the Mapping.
- Every id is the Project's own, and the names, slugs, labels, descriptions, default values and rules are the theme's. A field pointing at another Collection of the Contract points at the Collection of the Project filling it, and one pointing at its own Collection at the created one.
- Nothing the Project holds is changed. A Collection under the theme's plural slug, a Component under the theme's slug and a field definition under the theme's slug each throw `Conflict` naming it, and so does a Collection or field of the Contract something already fills.
- A Collection of the Contract the theme's fields point at that nothing fills throws `PreconditionFailed`, so fill or create that one first. A Component this website created from its theme before is used again rather than created twice.
- The labels and descriptions of the theme have to cover the Project's languages, because a Collection of the Project carries them in all of them. A theme that does not serve one of them throws `BadRequest` naming the label.
- Adding a required field of the theme to a Collection that already holds Entries throws `Conflict`, the way a field definition change does, and its `cause` names every Entry needing the Value. Send that Value per Entry under `resolutions`, keyed by Entry id and then by the field's own slug, see [`schema-changes.md`](./schema-changes.md#the-resolution-workflow).
- `core.destinations.createdCollections()` answers which Collections this website created from its theme, in the order they were created, so an app groups them under the website. A Collection deleted since is left out.
- Both take `isWaitingVersion: true` to create for the version that waits, against the Contract copy of that version.

## Following a theme's new version

A theme releases a version by tagging it, and each website keeps the version it uses until its Mapping covers a newer one, so a theme update never stops a Release.

```typescript
const newer = await core.destinations.newerVersions({
  projectId: project.id,
  id: website.id,
});
const kept = await core.destinations.keepVersion({
  projectId: project.id,
  id: website.id,
});
kept.outcome; // 'waiting', or 'in-use' for the version the website uses
```

- `newerVersions()` lists the versions tagged at the theme that are newer than the one in use, newest first, read with your own git access. A pre-release is listed and is taken only when it is named. `isPreReleaseVersion(version)` says which of them is one, so an app offering a version reads that the way Core does.
- `keepVersion()` takes the newest version tagged there unless it is given one, keeps a copy of its Contract in the Project and puts that version beside the one in use, with a Mapping of its own. The website goes on using the version it uses.
- The Mapping of the waiting version starts out as what the Mapping in use fills, plus every field the new version added whose id one of the Project's own field definitions carries. It is read against the copy of that version the Project keeps, which a theme moving a tag afterwards does not change.
- Which Entries it takes carries over as it is, a condition on a field definition the Collection no longer holds included. The check names that condition, so switching to the version waits for the editor to replace it rather than taking every Entry of the Collection.
- Every version newer than the one in use replaces the one that waits, keeping what was mapped for it. That holds for a version older than the one that waits too, so an app that offers a list of versions puts the one it is given beside the version in use whatever waits there. What the editor mapped for a field only the replaced version had is gone with it.
- Keeping the version that already waits again builds its Mapping the same way, so what was mapped stays and what the Project has gained since fills what was left unmapped. Nothing is written while it fills the same.
- The version the website already uses is answered with the outcome `in-use` and writes nothing.
- `check()` and `checkAll()` take `isWaitingVersion: true` for what the waiting version cannot take, and `update()` takes `waitingMapping` to replace its Mapping. Each of the three throws `PreconditionFailed` while no version waits.

```typescript
const switched = await core.destinations.switchVersion({
  projectId: project.id,
  id: website.id,
});
switched.outcome; // 'switched', or 'kept' while switched.issues names what is left
```

`switchVersion()` switches the website once nothing of the Project is left that the waiting version cannot take. Otherwise the website keeps the version it uses, and `issues` names each item the way `checkAll()` does. Nothing waits after a switch, and the Contract copy of the version left behind stays in the Project.

| What is wrong | What it throws |
| --- | --- |
| The version named is older than the one the website uses | `PreconditionFailed` |
| The Contract at that version carries another name than the version the website uses, at the theme or in the copy the Project keeps of it | `BadRequest` |
| No version waits, for a switch, a waiting Mapping or a check of one | `PreconditionFailed` |

Each of these is refused before anything is written, so the Project stays as it was and the website keeps the version it uses.

`keepVersion()` reads which copies the Project keeps before it writes, and a call running at the same time can save a copy of that version in between, through `contracts.keep()` for one. Another name in such a copy is not refused, and the waiting Mapping is read against what the theme answers rather than that copy. A caller that writes to one Project in parallel serializes those calls itself.

The CLI does both steps in one command. While anything is left it prints each item, leaves the website on the version it uses and exits non-zero:

```bash
elek website:update --project <id> --name autohaus-ebersfelde.de
```

## What the Project holds

```text
{projectId}/
|-- contracts/
|   |-- {contractId}/
|   |   |-- contract.json             the name and the origin it comes from
|   |   |-- {version}.json            one copy per version a Destination uses
|-- destinations/
|   |-- {destinationId}/
|   |   |-- destination.json          name, kind, Contract, version in use, Mapping, waiting version
```

- `contract.json` names where the Contract comes from, `{ "kind": "git", "url": "..." }` for a theme's address.
- A `{version}.json` copy carries the Contract as it was read and the commit of its origin it came from, so the Project stays self-contained and offline.
- A copy is never rewritten. A version already kept is the one a Destination keeps using.
- A Destination holds a copy's version under `contract.version` for the one it uses, and under `waiting.version` with a Mapping of its own for a newer one that waits.
- It holds what it created from its theme under `createdFromTheme`, so an app groups those Collections under the website and a second create uses the Components the first one made.
- No credential of any kind goes into the Project. An address carrying one is refused.

## What a site's build reads

A site built with Core's Astro integration reads a Project's Entries through its website's Mapping, in the shape of its own Contract, and stops the build on everything that does not fit.

- The site names its website in `elek.config.ts` and imports its own `elek.contract.json` beside it.
- Its collections, schemas and types come from that Contract, so the theme's code never names one Project's Collections or fields.
- The Contract's name is read from the Project's own copy and never from the theme's address, so a build needs no access to the theme.
- A site one Contract version behind the website builds what its own Contract names, as long as the Mapping fills every Collection and required field of it, and one whose code moved ahead stops the build.
- It reads the Values the way the Mapping fills them, and the Entries the Mapping's conditions let through. An Entry the website does not take reaches no page, and one that is taken while pointing at it stops the build.
- A build reads the version the website uses, never one that waits beside it, so a theme's new version changes nothing until the website switches to it.

See [the Astro integration](./usage.md#building-on-the-sites-own-contract) for the config, what a failing build prints and what a pipeline of your own needs.

## See also

- [`concepts.md`](./concepts.md) - Collections, Components and Entries, which a Contract is made of
- [`fields.md`](./fields.md) - the field types a Contract's field definitions carry
- [`git-and-sync.md`](./git-and-sync.md#reading-an-address-with-your-own-git-access) - the git access reading a theme's address takes
- [`usage.md`](./usage.md#the-cli) - `elek generate:contract`
- [`usage.md`](./usage.md#building-on-the-sites-own-contract) - the Astro site that builds on its Contract
- [`error-handling.md`](./error-handling.md) - `CoreError`, its types and its reasons
