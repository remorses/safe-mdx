// Pre-processing utilities for rendering plain markdown (not MDX) that contains raw HTML.
// Import from 'safe-mdx/markdown' to keep linkedom out of the main bundle.
export { htmlToMdx, remarkHtmlToMdx, parseHtmlToMdxAst } from './html/html-to-mdx-ast.ts'
export type { RemarkHtmlToMdxOptions } from './html/html-to-mdx-ast.ts'
