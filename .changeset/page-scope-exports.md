---
'safe-mdx': minor
---

Add support for page-scope `export function` and `export const` declarations when function evaluation is on. Exported components can be used as JSX on the same page. Exported helpers and constants can be called from expressions. React hooks work when `react` is provided through `modules`.

```mdx
import { useState } from "react"

export function formatTitle(text) {
  return text.toUpperCase()
}

export function Counter({ initial = 0 }) {
  const [count, setCount] = useState(initial)
  return <button className="px-4 py-2">{formatTitle("clicks")}: {count}</button>
}

# {formatTitle("hello")}

<Counter initial={3} />
```

Enable it with `evaluateOptions: { functions: true }` or by passing a non-empty `scope` object. Pass `modules: { react: React }` to resolve hook imports.

`useEffect` callbacks are real functions. They run after paint only when this renderer and the interpreted component execute as client React code. Hook components cannot run inside React Server Components.

Default exports, class exports, and re-exports stay unsupported. Declarations without `export` are not treated as page-scope bindings. A bare `function` is invalid MDX. A bare `const` is parsed as markdown.

This covers the request in #20.
