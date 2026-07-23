# Building in CI/CD

The Astro loaders read Projects from the local data directory. On your machine the Desktop app keeps that directory filled. A CI runner starts empty, so a build there needs to get the content first. This guide shows how.

The short version: declare your Projects once in the `elek()` integration, give CI a token for private remotes, done. `astro build` provisions the content by itself.

## What a CI build shows

A CI build provisions the `production` branch by default, which holds your published Releases. Local `astro dev` reads the Desktop-managed working copy on the `work` branch, which holds your drafts. So your deployed site shows Released content, while your local dev server shows drafts. This split is intentional: publishing is an editorial decision, made by creating a Release.

Two consequences:

- A brand-new Project with no Release yet fails the build with a clear error. Publish a Release first, or build drafts explicitly, see [Building drafts](#building-drafts-and-pinning-versions).
- Every build logs which content it reads, e.g. `Reading Project "Website" version 1.4.0 (production)`. When a deploy does not show what you expect, this log line tells you why.

## Setup

Add the `elek()` integration to your Astro config and declare each Project with its remote URL:

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

Your `content.config.ts` with the `elekAssets` and `elekEntries` loaders stays exactly as it is, see [`usage.md`](./usage.md#astro-integration).

For a private remote, set the `ELEK_IO_TOKEN` environment variable in CI to a read token for the content repository (for example a GitHub fine-grained PAT with contents read access, or a GitLab project access token). The token is handed to git per invocation and never written into URLs, logs or config. Some providers expect a specific username alongside the token, set `ELEK_IO_TOKEN_USER` then, it defaults to `x-access-token`. A public remote needs no token at all.

The integration runs read-only. No User is configured, nothing is committed and nothing is pushed. On your own machine, where the Project is managed by the Desktop app, the integration detects that and leaves the copy untouched.

## GitHub Actions

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
          ELEK_IO_TOKEN: ${{ secrets.ELEK_IO_TOKEN }}
```

The cache step is an optimization, not a requirement. Without it, every build performs a fresh build-mode clone: shallow, single ref, and only the Asset binaries of the built ref. That stays fast for most Projects.

## Vercel, Netlify and Cloudflare Pages

No pipeline file is needed. Set `ELEK_IO_TOKEN` (and optionally `ELEK_IO_REF`) in the provider's environment variable settings, then build as usual with `astro build`. Each build starts on a fresh runner and performs the shallow build-mode clone described above.

## Building drafts and pinning versions

Which content state a build uses is the `ref`: `production` (default), `work` (drafts), or a Release version like `1.4.0` (also preview versions like `1.5.0-preview.2`). Set it per Project in the integration config, or for the whole build through the `ELEK_IO_REF` environment variable, which overrides the config.

For a content staging site, create a second deployment (a separate provider project or a dedicated workflow) with `ELEK_IO_REF=work` and protect it from public access. Do not wire drafts into the provider's regular pull request previews, those URLs are shareable and would expose unpublished content alongside every code review.

Pinning a Release version gives reproducible builds: the same ref always produces the same content. The build then no longer moves when editors publish, until you change the pin.

## Rebuilding when content changes

A Release pushes the published content to the remote, but your site only rebuilds when something triggers a build. Wire the content repository's push webhook to your provider's build hook (all major providers offer an incoming build-hook URL) or to a `repository_dispatch` event in GitHub Actions. Until that is set up, redeploy manually after publishing.

## Non-Astro pipelines

The same engine is available as a CLI command for any other setup:

```bash
elek pull --project abc-123-... --url https://github.com/acme/website-content.git
```

It respects the same environment variables and leaves the Project in the data directory for whatever tool runs next. See the CLI section in [`usage.md`](./usage.md#the-cli).

## How provisioning behaves

The first build clones the Project into the data directory and writes a marker file. Later builds fetch and hard-reset that copy to the requested ref, so it always matches the remote, including a cached copy on a reused runner. A copy without the marker belongs to another application (for example the Desktop app) and is never touched. Details in [`git-and-sync.md`](./git-and-sync.md#provisioning-a-project-for-builds).

## Troubleshooting

- **First thing to try: delete the CI cache.** A cached data directory in a broken state is the most common cause of repeated failures, and provisioning rebuilds it from scratch.
- **"The remote has no production branch"**: no Release has been published yet. Publish one in the Desktop app, or build drafts with `ELEK_IO_REF=work`.
- **`Unauthorized`**: the remote requires authentication or rejected the token. Check `ELEK_IO_TOKEN`, and whether your git host expects a specific `ELEK_IO_TOKEN_USER`.
- **"No Release with version ..."**: the pinned version does not exist on the remote. The error lists the available versions.
- **`VersionSkew`**: the content was written by a newer Core than the build uses. Update the `@elek-io/core` dependency to at least the version named in the error.
- **Project not found, pointing at `elek()`**: the loaders ran without the Project being present. Add the integration, or make sure `ELEK_IO_DATA_DIR` points at the directory that holds it.

## See Also

- [`usage.md`](./usage.md) - the Astro integration, the CLI and all environment variables
- [`releases.md`](./releases.md) - publishing content as Releases
- [`git-and-sync.md`](./git-and-sync.md) - the branch model and provisioning internals
- [`error-handling.md`](./error-handling.md) - `CoreError` types and patterns
