# Provisioning

Projects live in the local data directory. On your machine the Desktop app keeps that directory filled. A build environment such as a CI runner starts empty, so any pipeline that consumes your content needs to get it there first. That step is called provisioning: Core fetches a Project from its remote into the data directory, read-only, and leaves it there for whatever your pipeline does next.

What comes next is up to you. Building an Astro site has a zero-step path through the `elek()` integration. Astro is the framework we focused on first, integrations for more frameworks will follow. But once a Project is provisioned it is a regular local Project, so everything else works too: reading it programmatically with `ElekIoCore`, exporting JSON with `elek export`, generating types and clients, or running your own scripts.

## What a CI environment sees

Provisioning follows the `production` channel by default, which resolves to your latest published Release. Your local working copy lives on the `work` branch, which holds your drafts. So a CI pipeline consumes Released content, while local development sees drafts. This split is intentional: publishing is an editorial decision, made by creating a Release.

Two consequences:

- A brand-new Project with no Release yet fails provisioning with a clear error. Publish a Release first, or consume another channel explicitly, see [Channels and pinned versions](#channels-and-pinned-versions).
- Provisioning logs which content state it fetched, e.g. `version 1.4.0 (production)`. When a pipeline does not produce what you expect, this log line tells you why.

## Provisioning with elek provision

The CLI command works in any pipeline, no matter what runs afterwards:

```bash
elek provision --project abc-123-... --url https://github.com/acme/website-content.git
```

Afterwards the Project sits in the data directory like any locally created one. Read it with the [programmatic API](./usage.md), export it with [`elek export`](./export.md), generate [typed clients](./api-clients.md), or start the [local API](./local-api.md) for another tool to consume.

`--ref` selects the content state, see [Channels and pinned versions](#channels-and-pinned-versions). The command runs read-only: no User is configured, nothing is committed and nothing is pushed.

## Astro: the elek() integration

For Astro sites, provisioning needs no pipeline step at all. Declare each Project in the `elek()` integration and `astro build` provisions before Astro's content sync runs:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { elek } from '@elek-io/core/astro';

export default defineConfig({
  integrations: [
    elek({
      projects: [
        {
          id: 'abc-123-...',
          remoteUrl: 'https://github.com/acme/website-content.git',
        },
      ],
    }),
  ],
});
```

Your `content.config.ts` with the `elekAssets` and `elekEntries` loaders stays exactly as it is, see [`usage.md`](./usage.md#astro-integration). On your own machine, where the Project is managed by the Desktop app, the integration detects that and leaves the copy untouched, so `astro dev` keeps reading your live drafts. Without the integration, a build on an empty runner fails with an error pointing here.

## Authentication for private remotes

Set the `ELEK_IO_REMOTE_ACCESS_TOKEN` environment variable to a read token for the content repository (for example a GitHub fine-grained PAT with contents read access, or a GitLab project access token). The token is handed to git per invocation and never written into URLs, logs or config. Some providers expect a specific username alongside the token, set `ELEK_IO_REMOTE_ACCESS_TOKEN_USER` then, it defaults to `x-access-token`. A public remote needs no token at all.

SSH remote URLs work as well. They authenticate through the runner's ambient SSH setup, for example a deploy key loaded into ssh-agent, the token does not apply to SSH.

## GitHub Actions

An Astro site, where the integration provisions on its own:

```yaml
name: Deploy website
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      # Optional: keep the provisioned content between runs, so
      # builds fetch increments instead of cloning fresh
      - uses: actions/cache@v4
        with:
          path: ~/elek.io
          key: elek-io-${{ github.run_id }}
          restore-keys: elek-io-
      - run: pnpm install
      - run: pnpm astro build
        env:
          ELEK_IO_REMOTE_ACCESS_TOKEN: ${{ secrets.ELEK_IO_REMOTE_ACCESS_TOKEN }}
```

For any other pipeline, provision explicitly and then do whatever consumes the content:

```yaml
      - run: pnpm exec elek provision --project abc-123-... --url https://github.com/acme/website-content.git
        env:
          ELEK_IO_REMOTE_ACCESS_TOKEN: ${{ secrets.ELEK_IO_REMOTE_ACCESS_TOKEN }}
      - run: pnpm exec elek export ./content
      - run: ./your-own-tooling ./content
```

The cache step is an optimization, not a requirement. Without it, every run performs a fresh build-mode clone: shallow, single ref, and only the Asset binaries of the fetched ref. That stays fast for most Projects.

## Vercel, Netlify and Cloudflare Pages

No pipeline file is needed for Astro sites. Set `ELEK_IO_REMOTE_ACCESS_TOKEN` (and optionally `ELEK_IO_CHANNEL`) in the provider's environment variable settings, then build as usual with `astro build`. Each build starts on a fresh runner and performs the shallow build-mode clone described above.

## Channels and pinned versions

Which content state provisioning fetches is the `ref`. It is either a channel, which always follows the newest content of its kind, or an exact version pin:

| Ref | Meaning |
| --- | --- |
| `production` | The latest Release (default) |
| `preview` | The latest preview Release |
| `draft` | The current drafts (the work branch) |
| `1.4.0`, `1.5.0-preview.2` | Exactly that Release or preview Release |

Set the ref per Project in the integration config or via `--ref` on `elek provision`. The `ELEK_IO_CHANNEL` environment variable overrides both and applies to every Project of a deployment, so one variable can repoint a whole pipeline. Because it is deployment-wide, it accepts channels only, exact versions are per-Project decisions and belong into the configuration.

For a content staging site, create a second deployment (a separate provider project or a dedicated workflow) with `ELEK_IO_CHANNEL=preview` for the latest published previews, or `ELEK_IO_CHANNEL=draft` for the raw editing state, and protect it from public access. Do not wire drafts into the provider's regular pull request previews, those URLs are shareable and would expose unpublished content alongside every code review.

Pinning a version gives reproducible pipelines: the same ref always produces the same content. The pipeline then no longer moves when editors publish, until you change the pin.

## Acting on content changes

A Release pushes the published content to the remote, but your pipeline only runs when something triggers it. Wire the content repository's push webhook to your provider's build hook (all major providers offer an incoming build-hook URL) or to a `repository_dispatch` event in GitHub Actions. Until that is set up, trigger manually after publishing.

## How provisioning behaves

The first run clones the Project into the data directory and writes a marker file. Later runs fetch and hard-reset that copy to the requested ref, so it always matches the remote, including a cached copy on a reused runner. A copy without the marker belongs to another application (for example the Desktop app) and is never touched. Details in [`git-and-sync.md`](./git-and-sync.md#provisioning-a-copy-for-builds).

Because every provision run overwrites the copy, a provisioned copy is read-only for everyone: any attempt to edit it, also through the Desktop app, throws a `CoreError` of type `PreconditionFailed` instead of losing the edits to the next build. Applications can recognize a provisioned copy through the `isProvisioned` field on the `Project`. To work on the Project again, delete the provisioned copy and clone it.

## Troubleshooting

- **First thing to try: delete the CI cache.** A cached data directory in a broken state is the most common cause of repeated failures, and provisioning rebuilds it from scratch.
- **"No Release has been published yet"**: the Project has never released. Publish a Release in the Desktop app, or consume the `preview` or `draft` channel instead.
- **`Unauthorized`**: the remote requires authentication or rejected the token. Check `ELEK_IO_REMOTE_ACCESS_TOKEN`, and whether your git host expects a specific `ELEK_IO_REMOTE_ACCESS_TOKEN_USER`. For an SSH remote, check the SSH key setup instead, the error message says which of the two applies.
- **"No Release with version ..."**: the pinned version does not exist on the remote. The error lists the available versions.
- **`VersionSkew`**: the content was written by a newer Core than the pipeline uses. Update the `@elek-io/core` dependency to at least the version named in the error.
- **Project not found, pointing at `elek()`**: the Astro loaders ran without the Project being present. Add the integration, or make sure `ELEK_IO_DATA_DIR` points at the directory that holds it.

## See Also

- [`usage.md`](./usage.md) - the programmatic API, the CLI, the Astro integration and all environment variables
- [`export.md`](./export.md) - exporting provisioned content to plain JSON
- [`api-clients.md`](./api-clients.md) - generating typed clients and TypeScript types
- [`releases.md`](./releases.md) - publishing content as Releases
- [`git-and-sync.md`](./git-and-sync.md) - the branch model and provisioning internals
- [`error-handling.md`](./error-handling.md) - `CoreError` types and patterns
