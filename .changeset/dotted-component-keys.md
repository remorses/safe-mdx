---
'safe-mdx': patch
---

Resolve dotted JSX tags such as `<Tree.Folder>` from a literal `'Tree.Folder'` key in `components` before falling back to the `components.Tree.Folder` property walk. The literal form is required with React Server Components, where a client reference carries no static properties. A dotted tag whose parent is missing now reports a `missing-component` error instead of throwing.
