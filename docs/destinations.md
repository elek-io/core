# Destinations

Where a Project's content goes, and what the place it goes to needs. A Destination is one such place, a website first. A Contract states what it needs, and a Mapping says which Project content fills it. This page covers generating a Contract from a Project, adding a website from its theme's git address, and asking what the website cannot take.

## Terms

| Term | What it is | Where it lives |
| --- | --- | --- |
| theme | The code a developer writes, which states a Contract | Its own git repository |
| Contract | What a theme needs, as Collections and Components | `elek.contract.json` in the theme, copied into the Project |
| website | The kind of Destination an editor adds, shown by its own name | The Project |
| Destination | One place content goes: its name, kind, Contract, version in use and Mapping | The Project |
| Mapping | Which Project Collection and field definition fills which field of the Contract | Inside the Destination |

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
- `core.destinations.update()` replaces the Mapping, renames the website, or both. The version in use never changes there.
- `core.destinations.delete()` removes the website and leaves every Contract as it is.
- `core.contracts.keep()` puts a Contract into the Project under its own origin, which `addWebsite()` does for you. It refuses an address carrying a credential or one git would run as a command, the same way, because the origin is written into the Project.

A Project with no website behaves exactly as one did before Destinations existed, and `list()` and `count()` answer with nothing for a Project whose folders predate them.

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
| `missing_required` | The Entry holds no Value for a required field of the Contract |
| `constraint_violation` | The Entry's Value does not satisfy the Contract's field definition |

- The first three are about the Mapping and come back whatever the Entries hold, so `checkAll()` reports each once.
- The last two name both sides: the Contract's field and the Project's own `collectionId`, `fieldDefinitionId` and `fieldSlug`, so an app can open the Entry at the field that raised it.
- The Mapping is read against the Collections the Project holds now. An entry of it naming a Collection or field definition that is gone fills nothing, so it is reported rather than taken as mapped, which is what a Project changing under a Mapping leaves behind.
- Values are read against the Contract's own field definitions. An Entry reference is moved onto the Contract's Collection ids through the Mapping first, and one pointing into a Collection of the Project that fills nothing is refused, whatever the Contract's field allows.
- A `dynamic` field is checked by the Components its items name, their count and whether one is there at all, never inside an item, because no Mapping maps a Component's own fields yet. A Value holding something other than Component items is refused, required or not.

The issues are spelled like the ones a field definition change raises, so an app words both the same way, see [`schema-changes.md`](./schema-changes.md#the-issues-an-update-reports).

## What the Project holds

```text
{projectId}/
|-- contracts/
|   |-- {contractId}/
|   |   |-- contract.json             the name and the origin it comes from
|   |   |-- {version}.json            one copy per version a Destination uses
|-- destinations/
|   |-- {destinationId}/
|   |   |-- destination.json          name, kind, Contract, version in use, Mapping
```

- `contract.json` names where the Contract comes from, `{ "kind": "git", "url": "..." }` for a theme's address.
- A `{version}.json` copy carries the Contract as it was read and the commit of its origin it came from, so the Project stays self-contained and offline.
- A copy is never rewritten. A version already kept is the one a Destination keeps using.
- No credential of any kind goes into the Project. An address carrying one is refused.

## What a site's build reads

A site built with Core's Astro integration reads a Project's Entries through its website's Mapping, in the shape of its own Contract, and stops the build on everything that does not fit.

- The site names its website in `elek.config.ts` and imports its own `elek.contract.json` beside it.
- Its collections, schemas and types come from that Contract, so the theme's code never names one Project's Collections or fields.
- The Contract's name is read from the Project's own copy and never from the theme's address, so a build needs no access to the theme.
- A site one Contract version behind the website still builds, and one whose code moved ahead stops the build.

See [the Astro integration](./usage.md#building-on-the-sites-own-contract) for the config, what a failing build prints and what a pipeline of your own needs.

## See also

- [`concepts.md`](./concepts.md) - Collections, Components and Entries, which a Contract is made of
- [`fields.md`](./fields.md) - the field types a Contract's field definitions carry
- [`git-and-sync.md`](./git-and-sync.md#reading-an-address-with-your-own-git-access) - the git access reading a theme's address takes
- [`usage.md`](./usage.md#the-cli) - `elek generate:contract`
- [`usage.md`](./usage.md#building-on-the-sites-own-contract) - the Astro site that builds on its Contract
- [`error-handling.md`](./error-handling.md) - `CoreError`, its types and its reasons
