# safe-mdx

## 1.11.4

1. **Fix expression-valued props dropped from JSX elements in expression attributes** — `style={{ color: 'red' }}`, arrays, computed values, and nested JSX on elements passed as expression props (e.g. `slot={<div style={{ color: 'red' }} />}`) are now preserved. Previously only `Literal` values were handled, silently dropping everything else.

2. **Fix expression children dropped from JSX elements in expression attributes** — `{"hello"}` and other `JSXExpressionContainer` children inside nested JSX elements (e.g. `slot={<div>{"hello"} world</div>}`) are now evaluated and preserved.

## 1.11.3

### Patch Changes

- beba8ce: Fix `style` prop (and other expression-valued props) being silently dropped from JSX elements passed as expression props. Previously, `transformJsxElement` only handled `Literal` values inside `JSXExpressionContainer` attributes, so object expressions like `style={{ color: 'red' }}` were ignored. Now all expression types are evaluated via `evaluateExpression`, preserving `style`, arrays, computed values, and nested JSX elements on JSX-in-attribute elements.

## 1.11.2

1. **Bare specifier resolution via exact modules-map keys** — `resolveModulePath` now matches bare specifiers (e.g. `egaki/text-to-speech`) against exact keys in the modules map instead of always returning `undefined`. Relative/absolute resolution and extension probing are unchanged.

## 1.11.1

1. **React Server Components fallback for `safe-mdx/client`** — the client-only dynamic ESM loader now has a `react-server` export that renders `null` in RSC environments. This keeps packages that import `SafeMdxRenderer` from evaluating browser-only React APIs like `React.Component` during server component startup.

## 1.11.0

1. **Agent-friendly error messages for MDX edge cases** — exports, unresolved imports, and missing scope variables now produce clear errors with line numbers instead of being silently ignored.

   **Export declarations** report the exported name and explain that exports are not evaluated:

   ```
   Unsupported named export "MyHelper". Export declarations are not evaluated,
   so exported values and components are not available in the document.
   ```

   **Unresolved imports** report the source path and which names could not be resolved:

   ```
   Unresolved import "Card" from "./components/card". The imported module could
   not be resolved, so these names are not available in the document.
   ```

   **Missing scope variables** throw with the identifier name and list available variables so typos are easy to spot:

   ```
   Failed to evaluate expression: unknownVar. unknownVar is not defined.
   Available variables: knownVar
   ```

2. **Improved identifier checker accuracy** — several false-positive fixes to `findMissingIdentifiers`:
   - JS globals (`undefined`, `NaN`, `Infinity`, `true`, `false`, `null`) are now excluded from missing-identifier checks
   - `||`, `&&`, `??` only check the left operand; `? :` only checks the test — branches that may never evaluate no longer raise false positives
   - Block-body arrow functions with destructuring patterns (`const { name } = item`) now register local bindings correctly
   - Per-statement line numbers for ESM blocks so export/import errors point to the exact line
   - Resolved imports are now tracked separately from pre-existing components, preventing silent masking of unresolved imports

## 1.10.0

1. **Module imports are now available in MDX expressions** — values resolved via the `modules` prop can be used in expressions (`{value}`) and JSX attributes (`prop={value}`), not just as component tags. This enables patterns like `?raw` imports where the module default export is a string:

   ```tsx
   const result = new MdastToJsx({
     modules: {
       "./example.ts?raw": { default: "const x = 1" },
     },
     // ...
   });
   ```

   ```mdx
   import code from "./example?raw";

   <CodeBlock code={code} />
   ```

   Module imports adding to scope do not auto-enable function calls in expressions — only an explicit `scope` prop does.

2. **Extensionless query imports now resolve correctly** — imports with Vite-style query suffixes like `?raw`, `?url`, or `?inline` are now resolved even without a file extension. For example, `import code from './example?raw'` resolves to `./example.ts?raw`:

   ```tsx
   resolveModulePath("./example?raw", "./", ["./example.ts?raw"]);
   // => './example.ts?raw'
   ```

## 1.9.0

1. **Relative imports above the content root now resolve correctly** — MDX files that import from outside the configured `baseUrl` (e.g. `../../../README.md`) are no longer silently dropped. Leading `../` segments are preserved in the resolved module key, so downstream tools can map external markdown files without rewriting source text:

   ```tsx
   // Previously returned undefined and the import was lost
   resolveModulePath("../../../README.md", "./", moduleKeys);
   // => '../../../README.md'
   ```

## 1.8.0

### Minor Changes

1. **New `safe-mdx/incremental-parse` export for streaming MDX** — parse markdown incrementally while it's being streamed (e.g. from an LLM). The new `parseMarkdownIncremental` API reuses stable top-level mdast nodes from a caller-owned cache and only reparses the live tail. Parse errors are returned in `errors` instead of thrown, so incomplete MDX keeps rendering the stable prefix:

   ```tsx
   import {
     parseMarkdownIncremental,
     type SegmentCache,
   } from "safe-mdx/incremental-parse";

   const cache: SegmentCache = new Map();
   const { mdast, errors } = parseMarkdownIncremental({
     markdown,
     cache,
     trailingNodes: 2,
   });
   ```

   Customize the parser with extra remark plugins via `createMdxProcessor({ remarkPlugins })`.

2. **New `remarkHtmlToMdx` remark plugin** — converts raw HTML nodes in plain markdown into mdxJsx AST nodes, so they can be rendered by `MdastToJsx`. Import from `safe-mdx/markdown` to keep `linkedom` out of the main bundle:

   ```ts
   import { remark } from "remark";
   import { remarkHtmlToMdx } from "safe-mdx/markdown";

   const processor = remark().use(remarkHtmlToMdx);
   const mdast = processor.parse(markdown);
   processor.runSync(mdast);
   ```

3. **Smaller main bundle** — `linkedom` is no longer imported from the main `safe-mdx` entry point. HTML-to-MDX conversion now lives entirely in the `safe-mdx/markdown` subpath.

## 1.7.0

### Minor Changes

1. **Built-in safe arrow function interpreter** — arrow function callbacks like `.map()`, `.filter()`, `.reduce()` now work out of the box when `scope` is provided, without needing `escodegen` or `new Function()`. Works in Cloudflare Workers and all edge runtimes:

   ```tsx
   <SafeMdxRenderer
     markdown={`{items.map(item => item.name).join(", ")}`}
     scope={{ items: [{ name: "Alice" }, { name: "Bob" }] }}
   />
   // → "Alice, Bob" — no escodegen needed, works in edge runtimes
   ```

   Supports expression bodies, block bodies with `return`, object/array destructuring params, default params, rest params, nested arrows, and chained calls. The legacy `generate` option from `escodegen` still works for users who pass it explicitly.

## 1.6.0

### Minor Changes

1. **New `scope` prop** — pass variables and functions to MDX expressions. When scope is provided, function calls are automatically enabled:

   ```tsx
   <SafeMdxRenderer
     scope={{
       greeting: "Hello",
       formatTitle: (opts) =>
         opts.uppercase ? opts.text.toUpperCase() : opts.text,
     }}
     markdown={`{greeting} <Heading title={formatTitle({ text: "hello", uppercase: true })} />`}
   />
   ```

   Scope works in JSX prop expressions, inline MDX expressions, and spread attributes.

2. **New `evaluateOptions` prop** — pass options to the expression evaluator. The most useful option is `generate` from `escodegen`, which unlocks inline arrow functions and callbacks like `.map()`:

   ```tsx
   import { generate } from "escodegen";

   <SafeMdxRenderer
     scope={{ items: [{ name: "Alice" }, { name: "Bob" }] }}
     evaluateOptions={{ generate }}
     markdown={`{items.map(item => item.name).join(", ")}`}
   />;
   ```

   Other options: `strict` (throw on undefined variables), `booleanLogicalOperators` (force `&&`/`||` to return booleans).

3. **New `EvaluateOptions` type export** — typed interface for the `evaluateOptions` prop with `functions`, `generate`, `booleanLogicalOperators`, and `strict` fields.

> **Security note**: `scope` lets MDX authors call any function you expose. The `generate` option uses `new Function()` under the hood, making it equivalent to `eval`. It also does not work in Cloudflare Workers or edge runtimes that block `new Function()`. Only use `generate` with trusted MDX content.

## 1.5.0

### Minor Changes

1. **New `onError` callback** — get notified of errors during rendering without using `MdastToJsx` directly. Works with both `SafeMdxRenderer` and `MdastToJsx`. Throw inside the callback to stop rendering on the first error:

   ```tsx
   <SafeMdxRenderer
     markdown={code}
     mdast={mdast}
     components={components}
     onError={(error) => {
       if (error.type === "validation") {
         throw new Error(
           `Invalid props on line ${error.line}: ${error.message}`
         );
       }
     }}
   />
   ```

2. **Typed errors with `SafeMdxError.type`** — every error now has a `type` field for easy filtering:

   | Type                | When it fires                                         |
   | ------------------- | ----------------------------------------------------- |
   | `validation`        | Component props fail schema validation                |
   | `missing-component` | MDX uses a component not in `components` or `modules` |
   | `expression`        | An expression like `{1 + fn()}` fails to evaluate     |
   | `esm-import`        | An ESM import URL is invalid or fails to parse        |

   ```ts
   const validationErrors = visitor.errors.filter(
     (e) => e.type === "validation"
   );
   ```

3. **Added `componentPropsSchema` documentation** — README now includes full usage examples for Standard Schema validation with Zod, showing how to define schemas, access errors, and filter by type.

## 1.4.0

### Minor Changes

1. **New server-side module resolution for MDX imports** — render MDX that uses `import` statements with locally provided modules, without relying on client-side ESM fetching. Three new exports from `safe-mdx/parse`:

   - `extractImports(ast)` — extracts all import declarations from a parsed mdast tree, returning structured metadata (source path + specifiers) without the HTTPS-only restriction that `parseEsmImports` enforces.
   - `resolveModulePath(source, baseUrl, moduleKeys)` — resolves an import source string against a list of available module paths, handling relative (`./card`), absolute (`/snippets/card`), and extension resolution (`.tsx`, `.ts`, `.jsx`, `.js`, `.mdx`, `.md`, `/index.*`).
   - `resolveModules({ glob, mdast, baseUrl })` — async utility that takes a lazy Vite `import.meta.glob` result and a parsed mdast, extracts the page's imports, resolves them against the glob keys, and returns only the needed modules eagerly loaded.

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

## 1.3.10

### Patch Changes

1. **Fixed crash with Cloudflare Workers and RSC dev** — the `DynamicEsmComponent` used by `allowClientEsmImports` is now imported through a dedicated `safe-mdx/client` subpath instead of a relative file path from the main entry. This keeps the `'use client'` boundary intact during Vite RSC dependency optimization so the module is no longer flattened into the server chunk, which previously caused a startup crash:
   ```
   Class extends value undefined is not a constructor or null
   ```
   No API changes are required — `allowClientEsmImports` works exactly the same as before.

## 1.3.9

### Patch Changes

- Add Vite demo showcasing safe-mdx with React, Tailwind CSS v4, and ESM component imports. The demo uses Tailwind CSS v4's new CSS-first configuration approach with the @plugin directive for typography styles. It demonstrates MDX ESM imports with the allowClientEsmImports boolean option, allowing direct imports from URLs like `import IOKnob from 'https://framer.com/m/IOKnob-DT0M.js@eZsKjfnRtnN8np5uwoAx'`. The demo includes comprehensive MDX features including headings, code blocks, tables, lists, and dynamic component loading. Run with `pnpm demo` to see safe-mdx in action with modern tooling and styling.
- Add React resource hints for dynamic ESM component URLs to improve loading performance. The DynamicEsmComponent now uses React's prefetchDNS and preconnect APIs to establish early connections to ESM CDN domains (like esm.sh), reducing latency when components are dynamically imported on the client side. This optimization happens automatically when using allowClientEsmImports and helps improve the user experience by starting the DNS lookup and connection handshake before the actual component import is triggered.
- normalize to the correct jsx ast nodes

## 1.3.8

### Patch Changes

- Add parentType prop to normalize jsx flow and text elements nodes

## 1.3.7

### Patch Changes

- Fix HTML indentation being preserved in text nodes. Text content in indented HTML is now properly de-indented before being passed to `textToMdast` or rendered as text nodes. This ensures that HTML formatting indentation doesn't leak into the rendered content.

## 1.3.6

### Patch Changes

- normalize to the correct jsx ast nodes

## 1.3.5

### Patch Changes

- Add Vite demo showcasing safe-mdx with React, Tailwind CSS v4, and ESM component imports. The demo uses Tailwind CSS v4's new CSS-first configuration approach with the @plugin directive for typography styles. It demonstrates MDX ESM imports with the allowClientEsmImports boolean option, allowing direct imports from URLs like `import IOKnob from 'https://framer.com/m/IOKnob-DT0M.js@eZsKjfnRtnN8np5uwoAx'`. The demo includes comprehensive MDX features including headings, code blocks, tables, lists, and dynamic component loading. Run with `pnpm demo` to see safe-mdx in action with modern tooling and styling.
- Add React resource hints for dynamic ESM component URLs to improve loading performance. The DynamicEsmComponent now uses React's prefetchDNS and preconnect APIs to establish early connections to ESM CDN domains (like esm.sh), reducing latency when components are dynamically imported on the client side. This optimization happens automatically when using allowClientEsmImports and helps improve the user experience by starting the DNS lookup and connection handshake before the actual component import is triggered.
- Better handling of md raw html. Smaller bundle on browser

## 1.3.4

### Patch Changes

- Add Vite demo showcasing safe-mdx with React, Tailwind CSS v4, and ESM component imports. The demo uses Tailwind CSS v4's new CSS-first configuration approach with the @plugin directive for typography styles. It demonstrates MDX ESM imports with the allowClientEsmImports boolean option, allowing direct imports from URLs like `import IOKnob from 'https://framer.com/m/IOKnob-DT0M.js@eZsKjfnRtnN8np5uwoAx'`. The demo includes comprehensive MDX features including headings, code blocks, tables, lists, and dynamic component loading. Run with `pnpm demo` to see safe-mdx in action with modern tooling and styling.
- Add React resource hints for dynamic ESM component URLs to improve loading performance. The DynamicEsmComponent now uses React's prefetchDNS and preconnect APIs to establish early connections to ESM CDN domains (like esm.sh), reducing latency when components are dynamically imported on the client side. This optimization happens automatically when using allowClientEsmImports and helps improve the user experience by starting the DNS lookup and connection handshake before the actual component import is triggered.
- Better handling of md raw html. Smaller bundle on browser

## 1.3.3

### Patch Changes

- Add Vite demo showcasing safe-mdx with React, Tailwind CSS v4, and ESM component imports. The demo uses Tailwind CSS v4's new CSS-first configuration approach with the @plugin directive for typography styles. It demonstrates MDX ESM imports with the allowClientEsmImports boolean option, allowing direct imports from URLs like `import IOKnob from 'https://framer.com/m/IOKnob-DT0M.js@eZsKjfnRtnN8np5uwoAx'`. The demo includes comprehensive MDX features including headings, code blocks, tables, lists, and dynamic component loading. Run with `pnpm demo` to see safe-mdx in action with modern tooling and styling.
- Add React resource hints for dynamic ESM component URLs to improve loading performance. The DynamicEsmComponent now uses React's prefetchDNS and preconnect APIs to establish early connections to ESM CDN domains (like esm.sh), reducing latency when components are dynamically imported on the client side. This optimization happens automatically when using allowClientEsmImports and helps improve the user experience by starting the DNS lookup and connection handshake before the actual component import is triggered.
- Better handling of md raw html. Smaller bundle on browser

## 1.3.2

### Patch Changes

- Add React resource hints for dynamic ESM component URLs to improve loading performance. The DynamicEsmComponent now uses React's prefetchDNS and preconnect APIs to establish early connections to ESM CDN domains (like esm.sh), reducing latency when components are dynamically imported on the client side. This optimization happens automatically when using allowClientEsmImports and helps improve the user experience by starting the DNS lookup and connection handshake before the actual component import is triggered.

## 1.3.1

### Patch Changes

- Fix error message formatting to avoid duplicate "Error:" prefix. Error messages now display the underlying error message directly without adding an additional "Error:" prefix, making the error messages cleaner and more readable.

## 1.3.0

### Minor Changes

- Add support for markdown line numbers via `addMarkdownLineNumbers` option. When enabled, this option adds a `data-markdown-line` attribute to each rendered element containing the line number of the corresponding markdown source. This enables mapping rendered elements back to their original position in the markdown source code.

  Example usage:

  ```tsx
  <SafeMdxRenderer mdast={mdast} addMarkdownLineNumbers={true} />
  ```

  The `data-markdown-line` attribute will be added to all rendered HTML elements like headings, paragraphs, lists, tables, etc., with the value being the start line number of the markdown node.

## 1.2.0

### Minor Changes

- Add support for rendering user-provided ESM components via HTTPS imports. Components can be imported using standard ESM import syntax with HTTPS URLs, and they will be dynamically loaded on the client side only, maintaining SSR compatibility. The implementation includes proper error boundaries to handle loading failures gracefully, URL validation to ensure only HTTPS imports are allowed for security, and uses React.lazy with useState to ensure imports are only initialized once per component instance. Example usage: `import Button from 'https://esm.sh/@mui/material@5.0.0/Button'` in MDX will dynamically load the Button component on the client side.
- Add support for JSX components inside attributes without relying on eval-estree-expression. Components can now be used in attributes like `<Heading icon={<Icon name="star" />}>` with both regular components and ESM imports. The implementation uses proper AST transformation instead of JavaScript evaluation for better security and type safety.

**New option:** `allowClientEsmImports` (disabled by default) - Controls whether ESM imports are processed. When disabled, ESM imports are ignored for security.

    Example usage with regular components:

    ```mdx
    <Heading icon={<span>👋</span>} level={1}>
      Hello World
    </Heading>

    <Cards actionButton={<Button>Click me</Button>}>
      Some content
    </Cards>
    ```

    ESM imported components (requires `allowClientEsmImports: true`):

    ```mdx
    import { Icon } from 'https://esm.sh/some-icon-library'

    <Heading icon={<Icon name='star' />}>Content</Heading>
    ```

    ```tsx
    // Enable ESM imports
    const result = SafeMdxRenderer({
        mdast,
        allowClientEsmImports: true, // Required for ESM imports
        components,
    })
    ```

- Add support for `eval-estree-expression` as a parser for JSX attribute expressions. This significantly improves the parsing of JSX arguments in MDX, enabling support for complex objects and arrays that are not valid JSON. For example, you can now pass props like `options={{foo: 1, bar: [2, 3], 'data-test': true}}`, or functions and nested structures, closely matching React's JSX behavior without requiring valid JSON syntax.

## 1.1.0

### Minor Changes

- add support for custom `createElement`. pass a no op function to use safe-mdx as a validation step
- add support for `componentPropsSchema` to validate components props to a standard schema (works with Zod, Valibot, etc)

## 1.0.5

### Patch Changes

- add line numbers to errors

## 1.0.4

### Patch Changes

- Rename CustomTransformer to RnderNode

## 1.0.3

### Patch Changes

- Export remarkMarkAndUnravel from /parse

## 1.0.2

### Patch Changes

- Removed unsupported code language errors

## 1.0.1

### Patch Changes

- Mark mdast as required

## 1.0.0

### Major Changes

- Renamed prop `code` to `markdown`.
- Renamed `customTransformer` prop to `renderNode`.
- The prop `mdast` is now always required. This makes the bundle size much smaller in the client when you already have a markdown ast, because you don't have to import mdxParse function and all its dependencies.
- `mdxParse` is now exported in `safe-mdx/parse` import path.

## 0.3.2

### Patch Changes

- Use simple react for jsx

## 0.3.1

### Patch Changes

- Nicer types declaration that is extensible

## 0.3.0

### Minor Changes

- render spans for text if hProperties is defined

### Patch Changes

- Add react memo to the exported component

## 0.2.0

### Minor Changes

- completeJsxTags

## 0.1.0

### Minor Changes

- Export remarkMarkAndUnravel plugin

## 0.0.6

### Patch Changes

- Fix inline jsx elements beign wrapped in <p/>

## 0.0.5

### Patch Changes

- Make headings overridable
