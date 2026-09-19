<div align='center'>
    <br/>
    <br/>
    <br/>
    <h3>safe-mdx</h3>
    <p>Render MDX in React without eval</p>
    <br/>
    <br/>
</div>

## Features

-   Render MDX without `eval` on the server, so you can render MDX in Cloudflare Workers and Vercel Edge
-   Works with React Server Components
-   Supports custom MDX components
-   Custom `createElement`. Pass a no-op function to use safe-mdx as a validation step.
-   Use `componentPropsSchema` to validate component props against a schema (works with Zod, Valibot, etc).
-   ESM `https://` imports support with `allowClientEsmImports` option (disabled by default for security)
-   Page-scope `export function` / `export const` components and helpers when function evaluation is on
-   Optional XSS sanitization for untrusted MDX (`sanitize`). Off by default.
-   Fast. 3ms to render the [full mdx document for Zod v3](https://github.com/colinhacks/zod/blob/0a49fa39348b7c72b19ddedc3b0f879bd395304b/packages/docs/content/packages/v3.mdx) (2500 lines)

## Why

The default MDX renderer uses `eval` (or `new Function(code)`) to render MDX components in the server. This is a security risk if the MDX code comes from untrusted sources and it's not allowed in some environments like Cloudflare Workers.

For example in a hypothetical platform similar to Notion, where users can write Markdown and publish it as a website, a user could be able to write MDX code that extracts secrets from the server in the SSR pass, using this library that is not possible. This is what happened with Mintlify platform in 2024.

Some use cases for this package are:

-   Render MDX in Cloudflare Workers and Vercel Edge
-   Safely render dynamically generated MDX code, like inside a ChatGPT-style interface
-   Render user generated MDX, like in a multi-tenant SaaS app

<br>

## Install

```
npm i safe-mdx
```

## Usage

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { DynamicEsmComponent } from 'safe-mdx/client'
import { mdxParse } from 'safe-mdx/parse'

const code = `
# Hello world

This is a paragraph

<Heading>Custom component</Heading>
`

export function Page() {
    const ast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={ast}
            components={{
                // You can pass your own components here
                Heading({ children }) {
                    return <h1>{children}</h1>
                },
                p({ children }) {
                    return <p style={{ color: 'black' }}>{children}</p>
                },
                blockquote({ children }) {
                    return (
                        <blockquote style={{ color: 'black' }}>
                            {children}
                        </blockquote>
                    )
                },
            }}
        />
    )
}
```

## Dotted component names

Tags like `<Tree.Folder>` resolve against the components map in two ways. A **literal key** `'Tree.Folder'` is checked first, then the property walk `components.Tree.Folder`.

```tsx
<SafeMdxRenderer
    markdown={code}
    mdast={ast}
    components={{
        Tree,
        'Tree.Folder': TreeFolder,
        'Tree.File': TreeFile,
    }}
/>
```

Prefer the literal key with **React Server Components**. A client component imported on the server is a client reference and carries no static properties, so `Tree.Folder` is `undefined` there even when the client module assigns it.

## Incremental parsing for streaming markdown

Use `safe-mdx/incremental-parse` when markdown is changing rapidly, like during an LLM stream. Stable top-level mdast nodes are reused from a caller-owned cache, while only the live tail is parsed again. Parse errors are returned in `errors` instead of being thrown, so incomplete MDX can keep rendering the stable prefix.

```tsx
import { useMemo } from 'react'
import { SafeMdxRenderer } from 'safe-mdx'
import {
    parseMarkdownIncremental,
    type SegmentCache,
} from 'safe-mdx/incremental-parse'

export function StreamingMdx({ markdown }: { markdown: string }) {
    const cache = useMemo<SegmentCache>(() => new Map(), [])
    const { mdast, errors } = parseMarkdownIncremental({
        markdown,
        cache,
        trailingNodes: 2,
    })

    return (
        <div>
            {errors.length ? <pre>{errors[0]?.message}</pre> : null}
            {mdast.children.map((block, index) => (
                <SafeMdxRenderer
                    key={block.position?.start.offset ?? index}
                    markdown={markdown}
                    mdast={block}
                />
            ))}
        </div>
    )
}
```

Customize the parser with extra remark plugins by creating a processor once and passing it to the incremental parser.

```ts
import remarkMath from 'remark-math'
import {
    createMdxProcessor,
    parseMarkdownIncremental,
} from 'safe-mdx/incremental-parse'

const processor = createMdxProcessor({
    remarkPlugins: [remarkMath],
})

const cache = new Map()
const { mdast, errors } = parseMarkdownIncremental({
    markdown,
    cache,
    processor,
})
```

## JSX Components in Attributes

safe-mdx supports using JSX components inside component attributes, providing a secure alternative to JavaScript evaluation.

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

const code = `
# Components in Attributes

<Card
  icon={<Icon name="star" />}
  actions={<Button variant="primary">Click me</Button>}
>
  Card content with JSX components in attributes
</Card>
`

export function Page() {
    const ast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={ast}
            components={{
                Card({ icon, actions, children }) {
                    return (
                        <div className="card">
                            <div className="header">
                                {icon}
                                <div className="actions">{actions}</div>
                            </div>
                            <div className="content">{children}</div>
                        </div>
                    )
                },
                Icon({ name }) {
                    return <span>⭐</span> // Your icon component
                },
                Button({ variant, children }) {
                    return <button className={variant}>{children}</button>
                },
            }}
        />
    )
}
```

### ESM Imports in Attributes

To use externally imported components in attributes, enable the `allowClientEsmImports` option:

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

const code = `
import { Icon } from 'https://esm.sh/lucide-react'
import Button from 'https://esm.sh/my-ui-library'

# External Components in Attributes

<Card
  icon={<Icon name="star" />}
  action={<Button>External Button</Button>}
>
  Using externally imported components
</Card>
`

export function Page() {
    const ast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={ast}
            allowClientEsmImports={true} // Required for ESM imports
            components={{
                Card({ icon, action, children }) {
                    return (
                        <div className="card">
                            <div className="header">
                                {icon}
                                {action}
                            </div>
                            <div className="content">{children}</div>
                        </div>
                    )
                },
            }}
        />
    )
}
```

`safe-mdx` resolves the client ESM renderer through its own `safe-mdx/client`
subpath, so enabling `allowClientEsmImports` does not need any extra prop.

**Security Note**: ESM imports are disabled by default. Only enable `allowClientEsmImports` when you trust the MDX source, as it allows loading external code.

## Server-side Module Resolution

Resolve MDX `import` statements against pre-loaded modules on the server — no client-side `eval` or ESM fetching needed. This is the recommended approach when your MDX files import local components.

**Simple case** — use Vite's `import.meta.glob` with `{ eager: true }` to load all modules upfront. The result is already the shape `modules` expects:

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

// { eager: true } returns the modules directly instead of lazy loaders:
// { './snippets/card.tsx': { Card, default: ... }, './snippets/badge.tsx': { Badge, ... } }
const modules = import.meta.glob('./snippets/**/*.tsx', { eager: true })

const code = `
import { Card } from '/snippets/card'
import { Badge } from '/snippets/badge'

# Hello

<Card title="Welcome">
  Status: <Badge label="new" />
</Card>
`

export function Page() {
    const mdast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={mdast}
            modules={modules}
            baseUrl="./pages/"
        />
    )
}
```

**With Vite `import.meta.glob`** — use `resolveModules` to lazily load only the modules the MDX actually imports:

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse, resolveModules } from 'safe-mdx/parse'

const code = `
import { Card } from '/snippets/card'

# Hello

<Card title="Welcome">content</Card>
`

export async function Page() {
    const lazyGlob = import.meta.glob('./snippets/**/*.tsx')
    const mdast = mdxParse(code)
    const modules = await resolveModules({
        glob: lazyGlob,
        mdast,
        baseUrl: './pages/',
    })

    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={mdast}
            modules={modules}
            baseUrl="./pages/"
        />
    )
}
```

`baseUrl` is the directory of the MDX file being rendered — it's used to resolve relative imports like `./card` to the correct module key. If omitted it defaults to `'./'`.

## Change default MDX parser

If you want to use custom MDX plugins, you can pass your own MDX processed ast.

By default `safe-mdx` already has support for

-   frontmatter
-   gfm

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { remark, Root } from 'remark'
import remarkMdx from 'remark-mdx'

const code = `
# Hello world

This is a paragraph

<Heading>Custom component</Heading>
`

const parser = remark()
    .use(remarkMdx)
    .use(() => {
        return (tree, file) => {
            file.data.ast = tree
        }
    })

const file = parser.processSync(code)
const mdast = file.data.ast as Root

export function Page() {
    return <SafeMdxRenderer markdown={code} mdast={mdast} />
}
```

## Reading the frontmatter

safe-mdx renderer ignores the frontmatter, to get its values you will have to parse the MDX to mdast and read it there.

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { remark } from 'remark'
import remarkFrontmatter from 'remark-frontmatter'
import { Yaml } from 'mdast'
import yaml from 'js-yaml'
import remarkMdx from 'remark-mdx'

const code = `
---
hello: 5
---

# Hello world
`

export function Page() {
    const parser = remark().use(remarkFrontmatter, ['yaml']).use(remarkMdx)

    const mdast = parser.parse(code)

    const yamlFrontmatter = mdast.children.find(
        (node) => node.type === 'yaml',
    ) as Yaml

    const parsedFrontmatter = yaml.load(yamlFrontmatter.value || '')

    console.log(parsedFrontmatter)
    return <SafeMdxRenderer markdown={code} mdast={mdast} />
}
```

## Override code block component

It's not practical to override the code block component using `code` as a component override, because it will also be used for inline code blocks. It also does not have access to meta string and language.

Instead you can use `renderNode` to return some JSX for a specific mdast node:

```tsx
<SafeMdxRenderer
    renderNode={(node, transform) => {
        if (node.type === 'code') {
            const language = node.lang || ''
            const meta = parseMetaString(node.meta)

            return (
                <CodeBlock {...meta} lang={language}>
                    <Pre>
                        <ShikiRenderer code={node.value} language={language} />
                    </Pre>
                </CodeBlock>
            )
        }
    }}
/>
```

## Validating component props

Use `componentPropsSchema` to validate component props against a schema. Works with any library that implements [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, etc).

Validation errors are collected in `visitor.errors` with line numbers and property paths. The component still renders with the invalid props, so you can show errors alongside the content.

```tsx
import { MdastToJsx, type ComponentPropsSchema } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'
import { z } from 'zod'

const code = `
<Heading level={2} title="test">Valid heading</Heading>

<Heading level={10}>Invalid - level too high</Heading>

<Cards count={-1}>Invalid - negative count</Cards>
`

const componentPropsSchema: ComponentPropsSchema = {
    Heading: z.object({
        level: z.number().min(1).max(6),
        title: z.string().optional(),
    }),
    Cards: z.object({
        count: z.number().positive(),
        variant: z.enum(['default', 'outline']).optional(),
    }),
}

export function Page() {
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        components: {
            Heading: ({ children, ...props }) => <h1 {...props}>{children}</h1>,
            Cards: ({ children, ...props }) => <div {...props}>{children}</div>,
        },
        componentPropsSchema,
    })
    const jsx = visitor.run()

    if (visitor.errors.length) {
        // errors include type, line number, component name, property path, and message
        // [
        //   { type: 'validation', message: 'Invalid props for component "Heading" at "level": Too big...', line: 3, schemaPath: 'level' },
        //   { type: 'validation', message: 'Invalid props for component "Cards" at "count": Too small...', line: 5, schemaPath: 'count' },
        // ]
    }

    return jsx
}
```

## RSC: don't pass components from a `'use client'` module

When using `SafeMdxRenderer` in a React Server Component, the `components` prop must be a plain server-side object. If the file exporting your components map has `'use client'` at the top, the entire module becomes an opaque client reference in RSC. Spreading a client reference produces an empty object, so `SafeMdxRenderer` silently falls back to plain HTML tags with no styling.

**Wrong:** exporting the components map from a `'use client'` file

```tsx
// components.tsx
'use client'
import Zoom from 'react-medium-image-zoom'

function P({ children }) {
    return <p className="prose">{children}</p>
}
function Img(props) {
    return <Zoom><img {...props} /></Zoom>
}

// This object becomes an opaque client reference in RSC
export const components = { p: P, img: Img }
```

**Correct:** keep the map in a server-compatible file, import only the client components

```tsx
// zoomable-image.tsx
'use client'
import Zoom from 'react-medium-image-zoom'
export function Img(props) {
    return <Zoom><img {...props} /></Zoom>
}

// components.tsx (no 'use client')
import { Img } from './zoomable-image'
function P({ children }) {
    return <p className="prose">{children}</p>
}
export const components = { p: P, img: Img }
```

Only components that use browser-only APIs (hooks, DOM refs, client libraries) belong in `'use client'` files. Pure JSX with classnames, config objects, and component maps must stay in server-compatible modules.

## Handling errors

`safe-mdx` collects errors during rendering and exposes them via the `onError` callback or the `visitor.errors` array. Each error has a `type` field so you can filter by category.

### Error types

Every error is a `SafeMdxError` object:

```ts
interface SafeMdxError {
    type: 'validation' | 'missing-component' | 'expression' | 'esm-import' | 'sanitize'
    message: string
    line?: number       // source line in the MDX
    schemaPath?: string // only for validation errors, e.g. "user.age"
}
```

| Type | When it fires |
|---|---|
| `validation` | Component props fail schema validation (via `componentPropsSchema`) |
| `missing-component` | MDX uses a `<Component>` that wasn't passed in `components` or resolved from `modules` |
| `expression` | An MDX expression like `{1 + fn()}` or a JSX attribute expression fails to evaluate |
| `esm-import` | An ESM `import` has an invalid URL or fails to parse (only with `allowClientEsmImports`) |
| `sanitize` | A tag or prop was stripped because `sanitize` is on |

### Using `onError` callback

Works with both `SafeMdxRenderer` and `MdastToJsx`. Called for each error during rendering. Throw inside the callback to stop rendering on the first error.

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

export function Page() {
    const mdast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={mdast}
            components={components}
            componentPropsSchema={componentPropsSchema}
            onError={(error) => {
                // only throw on schema validation errors
                if (error.type === 'validation') {
                    throw new Error(
                        `Invalid props on line ${error.line}: ${error.message}`,
                    )
                }
                // log other errors without stopping rendering
                console.warn(`[safe-mdx] ${error.type}: ${error.message}`)
            }}
        />
    )
}
```

### Using `MdastToJsx` directly

Access the full errors array after rendering:

```tsx
import { MdastToJsx } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

export function Page() {
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({ markdown: code, mdast, components })
    const jsx = visitor.run()

    // filter by type
    const validationErrors = visitor.errors.filter(e => e.type === 'validation')
    const missingComponents = visitor.errors.filter(e => e.type === 'missing-component')

    return jsx
}
```

## Scope

Pass variables and functions to MDX expressions with the `scope` prop. When scope is provided, function calls in expressions are automatically enabled.

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

const code = `
# {greeting}

<Card title={formatTitle({ text: "hello", uppercase: true })} />
`

const scope = {
    greeting: 'Welcome',
    formatTitle: (opts) => (opts.uppercase ? opts.text.toUpperCase() : opts.text),
}

export function Page() {
    const ast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={ast}
            components={components}
            scope={scope}
        />
    )
}
```

### Arrow functions and callbacks

Arrow functions and callbacks like `.map(item => item.name)` work out of the box when `scope` is provided. safe-mdx includes a built-in safe AST interpreter that evaluates function expressions by walking the syntax tree recursively, without using `new Function()` or `eval()`. This means arrow functions **work in Cloudflare Workers** and other edge runtimes.

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'

const code = `
{items.map(item => item.name).join(", ")}

{users.filter(u => u.role === "admin").map(u => u.name).join(", ")}

{nums.reduce((acc, x) => acc + x, 0)}

{items.map(item => formatName(item.name)).join(", ")}
`

export function Page() {
    const ast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={ast}
            scope={{
                items: [{ name: 'alice' }, { name: 'bob' }],
                users: [
                    { name: 'Alice', role: 'admin' },
                    { name: 'Bob', role: 'user' },
                ],
                nums: [1, 2, 3, 4],
                formatName: (s) => s.toUpperCase(),
            }}
        />
    )
}
```

Supported patterns include expression bodies (`x => x.name`), block bodies with return (`x => { return x * 2 }`), destructuring (`({ name }) => name`), multiple parameters (`(a, b) => a + b`), nested arrows, calling scope functions inside callbacks (`x => formatName(x)`), and chained calls like `.filter().map().join()`.

The `evaluateOptions` prop accepts the following options:

| Option | Type | Default | Description |
|---|---|---|---|
| `functions` | `boolean` | `false` | Enable function calls in expressions. Automatically set to `true` when `scope` is provided. |
| `generate` | `(ast) => string` | `undefined` | Pass `escodegen.generate` to use the legacy `new Function()` path instead of the built-in safe interpreter. Not needed in most cases. |
| `booleanLogicalOperators` | `boolean` | `undefined` | Force `&&` and `||` to return booleans instead of truthy/falsy values. |
| `strict` | `boolean` | `false` | Throw an error when variables referenced in expressions are undefined. |

### JavaScript globals are not available by default

safe-mdx evaluates expressions in a **sandboxed context** where only the variables you pass in `scope` exist. Standard JavaScript globals like `Math`, `Number`, `parseInt`, `JSON`, `Array`, `Object`, etc. are **not available** unless you explicitly include them.

This is intentional for security: untrusted MDX cannot access anything you don't explicitly provide. But it means expressions like `Math.round(1.5)` will fail with `"Math is not defined"` unless you add `Math` to the scope.

```tsx
const code = `
<Box width={Math.round(100 / 3)} />

Rounded: {Math.ceil(7.2)}

Parsed: {parseInt("42", 10)}
`

// Math, parseInt, etc. must be passed explicitly
const scope = {
  Math,
  parseInt,
  parseFloat,
  Number,
  JSON,
  Array,
  Object,
  Boolean,
  String,
  Infinity,
  NaN,
}

<SafeMdxRenderer
  markdown={code}
  mdast={mdxParse(code)}
  components={components}
  scope={scope}
/>
```

Only pass the globals your MDX content needs. For most use cases, `Math` alone is sufficient. Adding `JSON` enables `JSON.parse()` for data-driven content. All of these are safe, side-effect-free objects.

### Security considerations for scope

Using `scope` trades some of safe-mdx's sandboxing guarantees for expressiveness. Be aware of these risks:

- **`scope` with functions**: the MDX author can call any function you put in scope with any arguments. Only expose functions that are safe to call with arbitrary inputs. Never put functions that access the filesystem, database, or network in scope unless you trust the MDX source.

- **`evaluateOptions: { generate }`**: this overrides the built-in safe interpreter with `escodegen.generate`, which uses `new Function()` under the hood. This means **the MDX author can run arbitrary code** within the expression context. Only use `generate` when you fully trust the MDX content. This option **does not work in Cloudflare Workers** or other edge runtimes that block `new Function()` and `eval()`.

- **`evaluateOptions: { strict: true }`**: useful for catching typos in scope variable names. Without it, undefined variables silently resolve to `undefined`.

If you are rendering **untrusted MDX** (user-generated content, multi-tenant apps), avoid using `scope` with sensitive functions. Instead, define your logic inside custom components passed to the `components` prop, which keeps the MDX author constrained to the component API you define.

## Page-scope exports

With **function evaluation** on, you can export components and helpers in the MDX file and use them on the same page.

```mdx
export function Card({ title, children }) {
  return <div className="rounded-lg p-4">{title}{children}</div>
}

export function formatTitle(text) {
  return text.toUpperCase()
}

# {formatTitle("hello")}

<Card title="Welcome">Hello from a page-scope component</Card>
```

Turn it on with `evaluateOptions: { functions: true }`, or by passing a **non-empty** `scope` object.

```tsx
<SafeMdxRenderer
  markdown={code}
  mdast={mdxParse(code)}
  evaluateOptions={{ functions: true }}
  modules={{ react: React }}
/>
```

Put a **blank line** after the export block. MDX keeps reading ESM if the next line is attached.

To use React **hooks**, import them and pass React in `modules`:

```mdx
import { useState, useEffect } from "react"

export function Counter({ initial = 0 }) {
  const [count, setCount] = useState(initial)
  useEffect(() => {
    document.title = String(count)
  }, [count])
  return <button className="px-4 py-2">{count}</button>
}

<Counter initial={3} />
```

Hooks are the **real** React hooks. `useState` works for the first server paint. `useEffect` runs after paint on the **client**. Hook components cannot run inside React Server Components.

These stay unsupported: `export default` layouts, `export class`, re-exports, and declarations without the `export` keyword.

## Security

safe-mdx blocks **server-side** `eval`. That stops MDX from reading `process.env` during render.

It does **not** block browser XSS by default. Untrusted MDX can still emit `<script>`, `dangerouslySetInnerHTML`, or `iframe srcDoc`. React SSR will put that HTML in the page. The browser will run it.

Turn on `sanitize` when the MDX author is not trusted:

```tsx
<SafeMdxRenderer markdown={code} mdast={mdast} sanitize />
```

`sanitize` is a boolean. There are no extra allowlists. The policy is fixed.

### What it blocks

- Tags: `script`, `object`, `embed`, `applet`, `portal`, `frame`, `frameset`, `base`. `base` is not XSS alone. It rewrites every relative URL.
- Props: `dangerouslySetInnerHTML`, native `on*` handlers, `srcDoc`, `ping`
- URLs that are not `http`, `https`, `mailto`, `tel`, relative, or `data:image/*` on `img`

```mdx
<script>alert(1)</script>
<div dangerouslySetInnerHTML={{__html: '<img src=x onerror=alert(1)>'}} />
<iframe srcDoc="<script>alert(document.cookie)</script>" />
<a href="javascript:alert(1)">click</a>
```

Those render as nothing, or as the same tag with the unsafe prop removed.

### What it allows

**https iframes.** A remote iframe is another origin. It cannot read your cookies. `srcDoc`, `javascript:`, and `data:` sources are still stripped.

**style tags** with a text child, and `style={{ }}` props. React keeps the CSS as text. CSS can restyle the page. It cannot run JS.

**data image URLs** on `img`, for example `data:image/png;base64,...`.

**meta** and **link**. A refresh meta is a redirect. A stylesheet link is the same class as `<style>`. `javascript:` and `data:` on `link href` are still stripped.

Disabling function evaluation is **not** enough. Object literals and string attributes still work. That is why `sanitize` exists.

React 19 rewrites some `javascript:` URLs. It does not stop `dangerouslySetInnerHTML`, `srcDoc`, `<script>`, `vbscript:`, or `srcSet`. The peer range is `react: *`. Do not rely on that filter.

`sanitize` cannot make XSS impossible if you pass unsafe **custom components**, put functions or React nodes in `scope`, use `renderNode`, or set `allowClientEsmImports`. Output those paths create is trusted and is not walked again.

Custom props that the host later turns into `href` or `src` (for example `destination`) are also the host's job to validate.

A remote iframe can still phish or replace the top page with `top.location`. That is not XSS.

If tenants share a domain, one XSS can steal cookies from other tenants. Isolate tenants on different subdomains if you cannot use `sanitize`.

## Limitations

These features are not supported yet:

-   Importing components or data from other files (unless using `modules` prop for local imports or `allowClientEsmImports` for `https://` imports).
-   `export default` layouts, `export class`, and re-exports. Page-scope `export function` / `export const` work when function evaluation is on.

**Note**: JSX components in attributes are now supported! You can use React components inside attributes like `<Card icon={<Icon />}>` without relying on JavaScript evaluation.
