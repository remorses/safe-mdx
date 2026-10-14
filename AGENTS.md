# Architecture

`mdastic.parse` → plain transforms → `markAndUnravel` → mdast → `MdastToJsx` → React

- `src/parse.ts` owns parser defaults, import extraction, and module resolution.
- `src/incremental-parse.ts` caches stable segments and adjusts tail positions.
- `src/safe-mdx.tsx` interprets estree without eval and renders mdast nodes.
- `src/markdown.ts` exposes HTML conversion separately to keep DOM parsing out of rendering.
- Syntax errors are thrown unchanged from mdastic. Fix parser differences upstream, not here.

Read `CLAUDE.md` for project rules. Run `pnpm build`, `pnpm exec vitest run`, and `lintcn lint`.
