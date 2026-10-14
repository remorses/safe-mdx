---
'safe-mdx': minor
---

Replace the remark/unified parser with mdastic for faster MDX parsing and fewer dependencies. This is a breaking parser API change: replace `createMdxProcessor({ remarkPlugins })` with `createMdxProcessor({ syntax, transforms })` and call `processor.parse(code)` directly. Transforms are plain `(tree) => void` functions, run before JSX paragraph unwrapping. Replace `remarkMarkAndUnravel()` with `markAndUnravel(tree)`. AST types now come from `mdastic`; syntax plugins for other markdown extensions require an external parser. Add `htmlToMdx(tree, options)` and `normalizeMdxJsx(tree)` for plain transforms; keep the remark-compatible HTML wrappers.
