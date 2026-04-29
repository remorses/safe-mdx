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

## Handling errors

`safe-mdx` collects errors during rendering and exposes them via the `onError` callback or the `visitor.errors` array. Each error has a `type` field so you can filter by category.

### Error types

Every error is a `SafeMdxError` object:

```ts
interface SafeMdxError {
    type: 'validation' | 'missing-component' | 'expression' | 'esm-import'
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

By default, scope supports calling functions and accessing variables, but **inline arrow functions** like `.map(item => item.name)` require the `evaluateOptions` prop with a `generate` function from [escodegen](https://github.com/estools/escodegen).

```
npm i escodegen
```

```tsx
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'
import { generate } from 'escodegen'

const code = `
{items.map(item => item.name).join(", ")}
`

export function Page() {
    const ast = mdxParse(code)
    return (
        <SafeMdxRenderer
            markdown={code}
            mdast={ast}
            scope={{ items: [{ name: 'Alice' }, { name: 'Bob' }] }}
            evaluateOptions={{ generate }}
        />
    )
}
```

The `evaluateOptions` prop accepts the following options:

| Option | Type | Default | Description |
|---|---|---|---|
| `functions` | `boolean` | `false` | Enable function calls in expressions. Automatically set to `true` when `scope` is provided. |
| `generate` | `(ast) => string` | `undefined` | Pass `escodegen.generate` to support inline arrow functions and callbacks like `.map(x => x)`. |
| `booleanLogicalOperators` | `boolean` | `undefined` | Force `&&` and `||` to return booleans instead of truthy/falsy values. |
| `strict` | `boolean` | `false` | Throw an error when variables referenced in expressions are undefined. |

### Security considerations for scope

Using `scope` and `evaluateOptions` trades some of safe-mdx's sandboxing guarantees for expressiveness. Be aware of these risks:

- **`scope` with functions**: the MDX author can call any function you put in scope with any arguments. Only expose functions that are safe to call with arbitrary inputs. Never put functions that access the filesystem, database, or network in scope unless you trust the MDX source.

- **`evaluateOptions: { generate }`**: this is the most dangerous option. It uses `new Function()` under the hood to compile arrow functions and function expressions from the MDX source into executable JavaScript. This means **the MDX author can run arbitrary code** within the expression context. Only use `generate` when you fully trust the MDX content (e.g. your own content, not user-generated). This option is essentially equivalent to `eval` for the expression body. It also **does not work in Cloudflare Workers** or other edge runtimes that block `new Function()` and `eval()`, unless you enable the `unsafe-eval` compatibility flag.

- **`evaluateOptions: { strict: true }`**: useful for catching typos in scope variable names. Without it, undefined variables silently resolve to `undefined`.

If you are rendering **untrusted MDX** (user-generated content, multi-tenant apps), avoid using `scope` with sensitive functions and never enable `generate`. Instead, define your logic inside custom components passed to the `components` prop, which keeps the MDX author constrained to the component API you define.

## Security

safe-mdx is designed to avoid server-side evaluation of untrusted MDX input.

However, it's important to note that safe-mdx does not provide protection against client-side vulnerabilities, such as Cross-Site Scripting (XSS) or script injection attacks. While safe-mdx itself does not perform any evaluation or rendering of user-provided content, the rendering library or components used in conjunction with safe-mdx may introduce security risks if not properly configured or sanitized.

This is okay if you render your MDX in isolation from each tenant, for example on different subdomains, because an XSS attack cannot affect all tenants. But if instead you render the MDX from different tenants on the same domain, one tenant could steal cookies set from other customers.

## Limitations

These features are not supported yet:

-   Importing components or data from other files (unless using `modules` prop for local imports or `allowClientEsmImports` for `https://` imports).
-   Exporting unresolved components or declaring components inline in the MDX

**Note**: JSX components in attributes are now supported! You can use React components inside attributes like `<Card icon={<Icon />}>` without relying on JavaScript evaluation.
