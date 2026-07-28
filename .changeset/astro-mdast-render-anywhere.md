---
'@elek-io/core': patch
---

Rendered markdown now renders inside an Astro component, not only directly on a page. `mdastRender`'s built-in defaults were constructed with `jsx()` from `astro/jsx-runtime`, and Astro only unwraps such a value in the render pass it runs on a page's own result. One component deep it was written out as `[object Object]`, so the obvious way to reuse a site's rendering policy, a small `MdastContent.astro` wrapping the call, silently produced broken output.

The defaults are built with `renderTemplate` and `addAttribute` instead, the same two functions Astro's compiler emits into every `.astro` file, so what `mdastRender` returns is an ordinary Astro template result that renders in a page, in a component and through a slot alike:

```astro
---
// src/components/MdastContent.astro
const { root } = Astro.props;
---
{root !== null &&
  mdastRender(root, {
    html: (node) => /* ... */,
    assetReference: (node) => /* ... */,
    entryReference: (node, children) => /* ... */,
  })}
```

The rendered HTML is unchanged, and consumer handlers written as JSX inside an `.astro` template were never affected. Overrides built with `jsx()` in a shared module keep the old constraint, since they still produce a vnode: write them in a template instead.
