# Source layout

Where a schema, a type, a constant and a helper live in `src/`, so a service file reads as business logic from its first line. `pnpm test` enforces the service half through the `layout/*` rules in [`../src/test/documentation.ts`](../src/test/documentation.ts).

## A service file

A file in `src/service/` opens with its imports, then its class, which is the file's only export. Below the class it keeps only what the class alone uses and what is hoisted:

| Below the class          | Why it can stay                   |
| ------------------------ | --------------------------------- |
| an `interface` or `type` | erased at compile time            |
| a `function` declaration | hoisted, callable before its line |

Everything else lives elsewhere:

- A constant or a helper class goes to `src/util/`, in a file named after its area like [`util/git.ts`](../src/util/git.ts). A constant only the class reads may be a `private static readonly` member instead.
- A helper that is exported or tested on its own goes to `src/util/` too.
- A service builds no zod schema, not even inside a method. It imports one from `src/schema/`.

Constants are kept off the bottom of the file because a `const` or `class` declared there is in its temporal dead zone while the class body evaluates. A static member reading one throws at import.

## Schemas and types

Data Core parses gets a zod schema in `src/schema/`, with its type from `z.infer`. That covers caller props, files on disk, git output and anything from the network.

A schema there is public. `src/schema/index.ts` re-exports every schema file and the node entry re-exports that index, so a schema becomes part of the package.

A value that never crosses a boundary stays a named, documented TypeScript interface below the class. `ReleasedSide` in [`ReleaseService`](../src/service/ReleaseService.ts) is one: the service builds it and reads it itself, so a schema would only re-check Core's own object literal and publish an internal type.

## Rejected alternatives

- Every type as a zod schema. A handoff between two private methods has nothing to parse, and the schema would ship in the package.
- Types in a sibling `*.types.ts` file. It separates a type from its only user.
- Every helper function in `src/util/`. A private function declaration is hoisted, so below the class it costs nothing and stays next to its only caller.

## See also

- [`documentation.md`](./documentation.md#what-the-tools-enforce) - every rule `pnpm test` enforces, the `layout/*` rules included
- [`naming.md`](./naming.md) - how the things you place are named
