---
'@elek-io/core': minor
---

**A theme states what it needs as a Contract, generated from the Project it was built against rather than written by hand.** A Contract is a set of Collections and Components in Core's own schemas, plus a name, a version and the languages the theme serves. There is no second way to define a field, so every field type, constraint and validation rule a Collection has, a Contract has too.

```bash
elek generate:contract --project <id> --name @acme/dealer-site --contract-version 1.0.0
```

It writes `elek.contract.json` into the directory you name, which defaults to the current one, so it lands in the theme's own repository next to the code it describes. Run it again after the Project changed and the Contract follows, keeping the name and the version the file already carries unless you pass new ones. The first run has no file to read them from and needs both. The option is `--contract-version`, because `--version` answers with the CLI's own version.

- `--languages` takes `any` or the codes of the languages separated by commas, and defaults to the Project's own supported languages.
- A field definition pointing at a Collection or Component the Project does not hold throws `BadRequest` naming it, rather than writing a Contract whose references lead nowhere.
- Keep the Project a Contract was generated in. Field definition ids are what a Mapping binds to, so recreating a Collection by hand gives every field a new id and fills nothing.

**`core.contracts` reads a theme's Contract from its git address, at the newest version it tagged.** A theme releases a version by tagging it `v<version>` with an `elek.contract.json` carrying that same version. A pre-release is taken only when it is named.

```typescript
const theme = await core.contracts.readFromTheme({
  url: 'https://github.com/acme/dealer-site.git',
});
```

Core lists the tags, then fetches the one commit into a scratch repository under `tmp/`, which it removes again. Nothing is checked out and no Project is touched. An address that tagged no version throws `PreconditionFailed` with the reason `theme_without_version`, one whose version holds no `elek.contract.json` throws `NotFound`, and a file that is no Contract or carries another version than its tag throws `BadRequest`.

**Core reads a theme's address with your own git access and never with `ELEK_IO_REMOTE_ACCESS_TOKEN`.** It is the one git call that gets no token of Core's, because the address is kept in the Project and a credential must not be. A public theme needs nothing, and a private one answers to your own SSH key or git credential helper, with prompts off so a theme you have no access to fails with `Unauthorized` rather than hanging. The message names your own access and sends you to whoever maintains the address.

Two shapes of address are refused before git runs, both `BadRequest`:

- A password under any scheme, and a user alone under http or https, as in `https://user:token@host/org/repo.git`. `ssh://git@host/org/repo.git` is accepted, because an SSH user is part of the address rather than a credential, as it is in `git@host:org/repo.git`.
- A remote helper address such as `ext::sh -c ...`, which git runs as a command, and anything starting with `-`, which git reads as one of its own options.

**`core.destinations` adds a website to a Project from its theme's git address.** A Destination is one place a Project's content goes, a website first, shown by its own name such as `autohaus-ebersfelde.de`.

```typescript
const website = await core.destinations.addWebsite({
  projectId: project.id,
  name: 'autohaus-ebersfelde.de',
  url: 'https://github.com/acme/dealer-site.git',
});
```

- The Project keeps each Contract once per address, with a copy of every version a website uses, so it stays self-contained and offline. A second website on one theme shares that Contract, and removing one leaves it to the others.
- The Mapping starts out filling every field of the Contract whose id one of the Project's own field definitions carries, which is what a Contract generated from that Project gives. Nothing is guessed.
- The CLI does it too, and prints what the website cannot take yet. It exits non-zero while anything is left, and the website stays so you can map the rest. It writes and commits in the data directory, on the branch the Project is checked out on, and a synchronize takes it to the remote.

```bash
elek website:add --project <id> --name autohaus-ebersfelde.de --theme https://github.com/acme/dealer-site.git
```

- `--theme-version` pins a version rather than taking the newest tagged one. It is not `--version`, which answers with the CLI's own version.
- `read()`, `update()`, `delete()`, `list()` and `count()` complete the set. An update replaces the Mapping, renames the website, or both, and never changes the version in use.
- A name another Destination already carries throws `Conflict`, and every refusal happens before anything is written.

**`check()` and `checkAll()` say what a website cannot take**, one Entry or every Entry of every mapped Collection, as an array that is empty when it fits.

| `issue` | What is wrong |
| --- | --- |
| `collection_not_mapped` | No Collection of the Project fills a Collection the Contract names |
| `field_not_mapped` | No field definition fills a required field of the Contract |
| `reference_not_mapped` | A mapped reference field points at a Collection of the Contract that nothing fills |
| `missing_required` | The Entry holds no Value for a required field of the Contract |
| `constraint_violation` | The Entry's Value does not satisfy the Contract's field definition |

- The first three are about the Mapping and come back whatever the Entries hold, so `checkAll()` reports each once.
- The last two name both sides, the Contract's field and the Project's own `collectionId`, `fieldDefinitionId` and `fieldSlug`, so an app can open the Entry at the field that raised it. They are spelled like the issues a field definition change raises, so an app words both the same way.
- Values are read against the Contract's own field definitions, with every Entry reference moved onto the Contract's Collection ids through the Mapping first, so one pointing into a Collection nothing fills is refused.
- A `dynamic` field is checked by the Components its items name, their count and whether one is there at all, never inside an item.
- A Contract's `languages` is recorded rather than checked, because which Project language fills a field belongs to a Mapping.

**A Project without a website is unchanged.** `list()` and `count()` answer with nothing for a Project whose folders predate Contracts and Destinations, and neither file gets a migration step. A new Project adds an empty `contracts/` and `destinations/` folder beside `collections/` and `components/`. See `docs/destinations.md`.
