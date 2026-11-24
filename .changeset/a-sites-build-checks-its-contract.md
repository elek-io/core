---
'@elek-io/core': minor
---

**An Astro site reads a Project's Entries in the shape of its own Contract, and stops its build on everything that does not fit.** The site names the website that follows its theme and imports the `elek.contract.json` beside it, and from there its collections, schemas and types are the Contract's rather than one Project's.

```typescript
// elek.config.ts
import { defineElekConfig } from '@elek-io/core/astro';
import contract from './elek.contract.json';

export const config = defineElekConfig({
  projects: {
    website: {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      destination: 'autohaus-ebersfelde.de',
    },
  },
  contract,
});
```

- `destination` is the website's own name, the one the editor gave it, or its id. `elekCollections()` then derives one collection per Collection of the Contract, so a Contract with a `posts` Collection gives `websitePosts` however the Project's own Collection is named, and a page reads `post.data.title.en` under the Contract's own field slug.
- A Collection is named under `collections` by the Contract's plural slug or its id, the same two as before.
- Values stay keyed by the Project's languages, an Entry reference carries the `collectionId` of the Contract Collection it landed in, and a Single Entry of the Contract is read under `single`.
- An optional field of the Contract nothing fills is empty, `null` in every language or an empty list, the same as a field the editor left empty. A required one stops the build instead. A Value the Contract does not ask for is left out.
- `destination` and `contract` go together. Either one alone fails the config where you wrote it, because a site with one of them would read the Project's own Collections while its code expects the Contract's.

**The build names every Collection, every required field and every Entry the Project does not fill, and why.** The Mapping comes first, in one error over the Collections the site derives, before an Entry is read:

```text
Destination "autohaus-ebersfelde.de" of Project "website" does not fill the
Contract "@acme/dealer-site" at version 1.1.0 while the website uses 1.0.0:
- No Collection of the Project fills "pages"
- No field of the Project fills the required field "author" of "posts"
```

Then every Entry a Collection of the Contract refuses, named with its field and its language, such as `Entry "0b1f...", field "title" in "en": Too big: expected string to have <=10 characters`. A Single Entry of the Contract filled from a Collection holding several Entries is named there too, because which of them the site would read is arbitrary. Nothing of that collection is stored while it does not fit, so no page renders half a Collection. Astro loads its collections together and stops on the first one that fails, so the Entries of one Collection are named at a time. Every one of these but the Single Entry is an issue `core.destinations.check()` reports as well, so a build and the editor's check word the same problem the same way. The count is the build's own, because the check reads one Entry at a time.

**A pipeline of your own needs the site's repository and read access to the content remote, and nothing else.** The Contract comes from the site's own file and its name from the Project's own copy, never from the theme's git address, so no build needs access to the theme. The version in use is the Project's: a site one version behind builds what its own Contract names, leaving out the rest, and a site whose code moved ahead stops the build naming the Collections and required fields the Project does not fill yet. No elek.io Cloud takes part.

A site that names no website is untouched and reads the Project's own Collections exactly as before. In `astro dev` the Mapping and the Collection it reads through join the content model, so changing either in the app asks for a restart of the dev server the way a field definition change does.
