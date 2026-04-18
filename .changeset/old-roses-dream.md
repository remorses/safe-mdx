---
'safe-mdx': minor
---

Add server-side module resolution for MDX imports. Three new exports from `safe-mdx/parse`:

- `extractImports(ast)` — extracts all import declarations from a parsed mdast tree, returning structured metadata (source path + specifiers) without the HTTPS-only restriction that `parseEsmImports` enforces.
- `resolveModulePath(source, baseUrl, moduleKeys)` — resolves an import source string against a list of available module paths, handling relative (`./card`), absolute (`/snippets/card`), and extension resolution (`.tsx`, `.ts`, `.jsx`, `.js`, `.mdx`, `.md`, `/index.*`).
- `resolveModules({ glob, mdast, baseUrl })` — async utility that takes a lazy Vite `import.meta.glob` result and a parsed mdast, extracts the page's imports, resolves them against the glob keys, and returns only the needed modules eagerly loaded. This is the recommended way to build the `modules` prop from a Vite glob.

`SafeMdxRenderer` and `MdastToJsx` accept two new props:

- `modules` — `Record<string, Record<string, any>>` keyed by file path (e.g. from `import.meta.glob` with `eager: true`). When MDX contains `import { Card } from './card'`, the source is resolved against these keys.
- `baseUrl` — directory of the current MDX file (e.g. `'./pages/'`), used to resolve relative import sources.

Example usage with Vite:

```tsx
import { mdxParse, resolveModules } from 'safe-mdx/parse'
import { SafeMdxRenderer } from 'safe-mdx'

const lazyGlob = import.meta.glob('./snippets/**/*.tsx')
const mdast = mdxParse(mdxString)
const modules = await resolveModules({ glob: lazyGlob, mdast, baseUrl: './pages/' })

<SafeMdxRenderer mdast={mdast} modules={modules} baseUrl="./pages/" components={components} />
```
