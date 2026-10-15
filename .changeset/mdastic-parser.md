---
'safe-mdx': minor
---

`mdxParse` now parses with mdastic instead of remark/unified. It is much faster and returns the same mdast. This is not a breaking change: `createMdxProcessor({ remarkPlugins })`, `mdxProcessor`, `MdxProcessor` and `remarkMarkAndUnravel()` keep working. Add `createMdxParser({ syntax, transforms })` for a fast parser with plain `(tree) => void` transforms, plus `markAndUnravel(tree)`, `htmlToMdx(tree, options)` and `normalizeMdxJsx(tree)` as plain functions. `parseMarkdownIncremental` accepts either parser kind in its `processor` option.
