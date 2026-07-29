---
'@elek-io/core': patch
---

`elek generate:types <outDir> js` no longer fails when the data directory holds no Projects. There was no types file to compile, and the empty entry list reached the compiler, which rejected it with `No input files`. The compile step is now skipped when there is nothing to compile, so the command writes nothing and exits successfully, the same way it already did for the default `ts` language. Because the check runs before the compiler is loaded, this case also no longer asks for the optional `tsdown` and `typescript` peers.
