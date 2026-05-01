---
'safe-mdx': minor
---

Add `safe-mdx/incremental-parse` for segment-cached MDX parsing while markdown is streaming or changing rapidly. The new `parseMarkdownIncremental` API reuses stable mdast nodes from a caller-owned cache, returns `{ mdast, errors }` instead of throwing on parse failures, and supports custom remark plugins through `createMdxProcessor({ remarkPlugins })`.
