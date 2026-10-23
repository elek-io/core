---
'@elek-io/core': minor
---

**Every dependency is up to date.** The dependencies Core ships inside its bundles moved like this:

| Dependency                   | From    | To      |
| ---------------------------- | ------- | ------- |
| `@hono/node-server`          | 2.0.12  | 2.1.5   |
| `@hono/zod-openapi`          | 1.5.1   | 1.6.3   |
| `@scalar/hono-api-reference` | 0.11.11 | 0.12.13 |
| `@sindresorhus/slugify`      | 3.0.0   | 3.0.1   |
| `fs-extra`                   | 11.4.0  | 11.4.1  |
| `hono`                       | 4.12.32 | 4.13.13 |
| `mime`                       | 4.1.0   | 4.1.1   |
| `p-queue`                    | 9.3.3   | 10.0.0  |
| `uuid`                       | 14.0.1  | 14.0.3  |

`semver`, `winston` and `winston-daily-rotate-file` stayed where they were. No export of any entry point was added, removed or renamed. The published declarations do carry `z.ZodTypeAny` where they used to carry `z.ZodType`. Zod 4.4.3 exported `ZodTypeAny` as a second name for `ZodType`, and Zod 4.6 declares it as a deprecated alias of its own, so the name Core's source already wrote now shows in the declarations. It resolves to your copy of Zod either way.

**One behavior changed, in slugs.** slugify 3.0.1 fixed a contraction or a possessive followed by punctuation, so `Ada's, blog` now gives `adas-blog` where it used to give `ada-s-blog`. A slug already stored keeps its value, and only a slug derived after the update differs.

**tsdown's peer range is `^0.23.0`**, up from `^0.22.3`, and it stays inside the minor the suite proves. It is the optional peer `elek generate:client` and `elek generate:types` need with `js` as the language, so install tsdown 0.23 or later alongside Core if you use either. `typescript` is unchanged at `^5.0.0 || ^6.0.0 || ^7.0.0`, which is what tsdown 0.23 declares.

**Generating JavaScript prints no deprecation warning.** Core passed the compiler an option it had deprecated, which printed a warning a consumer could only read as something they had done.
