---
'safe-mdx': patch
---

Render JSX nested in safe MDX expressions, including conditional fields such as `{visible && <TextField />}`, ternary expressions, fragments, arrays, objects, and callback results such as `items.map(item => <Card>{item.name}</Card>)`. Nested elements still use the configured component allow-list and prop validation.
