---
'safe-mdx': minor
---

Add built-in safe AST interpreter for arrow functions and function expressions that works without `new Function()` or `eval()`. When `scope` is provided, arrow function callbacks like `.map(item => item.name)`, `.filter(x => x > 3)`, `.reduce((acc, x) => acc + x, 0)` now work out of the box in Cloudflare Workers and other edge runtimes, without needing `escodegen` or the `generate` option. The interpreter walks the ESTree AST recursively, supporting expression bodies, block bodies with return, object/array destructuring params, default params, rest params, nested arrows, and chained calls. The legacy `generate` option still works for users who explicitly pass `escodegen.generate`.

```tsx
<SafeMdxRenderer
    markdown={code}
    mdast={ast}
    scope={{
        items: [{ name: 'Alice' }, { name: 'Bob' }],
    }}
/>
// {items.map(item => item.name).join(", ")} → "Alice, Bob"
// No escodegen needed, works in Cloudflare Workers
```
