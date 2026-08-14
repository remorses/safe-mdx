// Probe whether MDX can export page-scope React components and helpers, then use them as JSX or calls.
import dedent from 'dedent'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { mdxParse } from './parse.ts'
import { MdastToJsx } from './safe-mdx.tsx'

function renderExports(
    code: string,
    {
        modules = { react: React },
        scope,
    }: {
        modules?: Record<string, Record<string, any>>
        scope?: Record<string, any>
    } = {},
) {
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        evaluateOptions: { functions: true },
        modules,
        scope,
    })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    return { result, errors: visitor.errors || [], html }
}

test('export function component at top with props, children, and tailwind className', () => {
    const code = dedent`
        export function Card({ title, children }) {
          return <div className="rounded-lg border p-4 shadow-sm"><h2 className="text-lg font-semibold">{title}</h2><div className="text-sm text-gray-600">{children}</div></div>
        }

        # Docs

        <Card title="Welcome">Hello from a page-scope component</Card>
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1>Docs</h1><div class="rounded-lg border p-4 shadow-sm"><h2 class="text-lg font-semibold">Welcome</h2><div class="text-sm text-gray-600">Hello from a page-scope component</div></div>"`)
})

test('export const arrow component at top with destructured props', () => {
    const code = dedent`
        export const Alert = ({ children, variant = "info" }) => <div className={"rounded px-3 py-2 " + variant}>{children}</div>

        <Alert variant="warning">Watch this</Alert>
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<div class="rounded px-3 py-2 warning">Watch this</div>"`)
})

test('export function component at bottom, used earlier in the page', () => {
    const code = dedent`
        # Bottom export

        <Badge label="new" />

        export function Badge({ label }) {
          return <span className="rounded-full bg-blue-500 px-2 py-0.5 text-white">{label}</span>
        }
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1>Bottom export</h1><span class="rounded-full bg-blue-500 px-2 py-0.5 text-white">new</span>"`)
})

test('export helper function and call it in a page expression', () => {
    const code = dedent`
        export function formatTitle(text) {
          return text.toUpperCase()
        }

        # {formatTitle("hello world")}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1>HELLO WORLD</h1>"`)
})

test('forward const reference reports an error instead of silent NaN', () => {
    const code = dedent`
        export const result = base + 1
        export const base = 2

        {result}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "line": 1,
          "message": "Failed to evaluate export "result": Cannot access "base" before initialization",
          "type": "expression",
        },
        {
          "line": 4,
          "message": "Failed to evaluate expression: result. Cannot access "result" before initialization",
          "type": "expression",
        },
      ]
    `)
    expect(html).toMatchInlineSnapshot(`""`)
})

test('function export can close over a later const', () => {
    const code = dedent`
        export function greet(name) {
          return prefix + " " + name
        }

        export const prefix = "Hello"

        {greet("Ada")}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"Hello Ada"`)
})

test('export const value and use it in a page expression', () => {
    const code = dedent`
        export const greeting = "Welcome"
        export const count = 3

        # {greeting}

        You have {count} items
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1>Welcome</h1><p>You have 3 items</p>"`)
})

test('import useState from react and export a hook component with props and tailwind', () => {
    const code = dedent`
        import { useState } from "react"

        export function Counter({ initial = 0, label }) {
          const [count, setCount] = useState(initial)
          return <button className="rounded bg-blue-500 px-4 py-2 text-white" onClick={() => setCount((c) => c + 1)}>{label}: {count}</button>
        }

        <Counter initial={3} label="Clicks" />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<button class="rounded bg-blue-500 px-4 py-2 text-white">Clicks: 3</button>"`)
})

test('exported helper is called from an exported component', () => {
    const code = dedent`
        export function greet(name) {
          return "Hello " + name
        }

        export function Card({ name }) {
          return <div className="p-4 text-sm">{greet(name)}</div>
        }

        <Card name="Ada" />
        {greet("world")}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<div class="p-4 text-sm">Hello Ada</div>Hello world"`)
})

test('import useMemo and use an exported helper inside the component', () => {
    const code = dedent`
        import { useMemo } from "react"

        export const prefix = "Hello"

        export function greet(name) {
          return prefix + " " + name
        }

        export function Card({ name }) {
          const label = useMemo(() => greet(name), [name])
          return <div className="p-4 text-sm font-medium">{label}</div>
        }

        # {prefix}

        {greet("world")}

        <Card name="Ada" />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<h1>Hello</h1>Hello world<div class="p-4 text-sm font-medium">Hello Ada</div>"`)
})

test('exported component can render another exported component', () => {
    const code = dedent`
        export function Icon({ name }) {
          return <span className="inline-block">{name}</span>
        }

        export function Row({ name }) {
          return <div className="flex gap-2"><Icon name={name} /> {name}</div>
        }

        <Row name="star" />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<div class="flex gap-2"><span class="inline-block">star</span> star</div>"`)
})

test('array destructure in an exported helper', () => {
    const code = dedent`
        export function split() {
          const [left, right] = ["one", "two"]
          return left + "-" + right
        }

        {split()}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"one-two"`)
})

test('object destructure with default inside a component body', () => {
    const code = dedent`
        export function User({ user }) {
          const { name = "anon", role } = user
          return <span className="font-medium">{name} ({role})</span>
        }

        <User user={{ name: "Ada", role: "admin" }} />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<span class="font-medium">Ada (admin)</span>"`)
})

test('nested prop destructure and rest props', () => {
    const code = dedent`
        export function Card({ user: { name }, title, ...rest }) {
          return <section className={rest.className}><strong>{title}</strong> {name}</section>
        }

        <Card title="Hello" user={{ name: "Ada" }} className="p-4 border" />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<section class="p-4 border"><strong>Hello</strong> Ada</section>"`)
})

test('conditional early return and if/else JSX', () => {
    const code = dedent`
        export function Status({ ok, label }) {
          if (!label) {
            return null
          }
          if (ok) {
            return <span className="text-green-500">{label} ok</span>
          } else {
            return <span className="text-red-500">{label} failed</span>
          }
        }

        <Status ok={true} label="Build" />
        <Status ok={false} label="Test" />
        <Status ok={true} label="" />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<span class="text-green-500">Build ok</span><span class="text-red-500">Test failed</span>"`)
})

test('exported helper with if/else and a later page call', () => {
    const code = dedent`
        export const limit = 10

        export function labelFor(count) {
          if (count > limit) {
            return "too many"
          }
          return "ok:" + count
        }

        {labelFor(3)} / {labelFor(20)}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<p>ok:3 / too many</p>"`)
})

test('useState, useMemo, constants, helper, and conditional together', () => {
    const code = dedent`
        import { useState, useMemo } from "react"

        export const unit = "pts"

        export function formatScore(value) {
          return value + " " + unit
        }

        export function Score({ initial, bonus }) {
          const [base] = useState(initial)
          const total = useMemo(() => base + bonus, [base, bonus])
          if (total <= 0) {
            return <span className="text-gray-400">empty</span>
          }
          return <span className="font-mono">{formatScore(total)}</span>
        }

        <Score initial={2} bonus={3} />
        <Score initial={0} bonus={0} />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<span class="font-mono">5 pts</span><span class="text-gray-400">empty</span>"`)
})

test('useEffect receives a real callback that can run later on the client', () => {
    let receivedFn: (() => any) | undefined
    let receivedDeps: any
    const useEffect = (fn: any, deps: any) => {
        receivedFn = fn
        receivedDeps = deps
        return React.useEffect(fn, deps)
    }

    const code = dedent`
        import { useEffect, useState } from "react"

        export const note = "ready"

        export function Tracker({ id }) {
          const [seen] = useState(id)
          useEffect(() => {
            return note + ":" + seen
          }, [seen])
          return <span className="text-xs">{seen}</span>
        }

        <Tracker id="abc" />
    `

    const { html, errors } = renderExports(code, {
        modules: {
            react: {
                ...React,
                useEffect,
                useState: React.useState,
            },
        },
    })
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<span class="text-xs">abc</span>"`)
    expect(typeof receivedFn).toBe('function')
    expect(receivedFn?.()).toBe('ready:abc')
    expect(receivedDeps).toEqual(['abc'])
})

test('bottom export hook component is available above it', () => {
    const code = dedent`
        <Counter initial={4} />

        import { useState } from "react"

        export function Counter({ initial }) {
          const [count] = useState(initial)
          return <em className="tabular-nums">{count}</em>
        }
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<em class="tabular-nums">4</em>"`)
})

test('explicit functions: false does not evaluate exports even with scope', () => {
    const code = dedent`
        export const exposed = secret

        {exposed}
    `

    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        scope: { secret: 'yes' },
        evaluateOptions: { functions: false },
    })
    const html = renderToStaticMarkup(visitor.run())
    expect(visitor.errors).toMatchInlineSnapshot(`
      [
        {
          "line": 1,
          "message": "Unsupported named export "exposed". Export declarations are not evaluated, so exported values and components are not available in the document.",
          "type": "expression",
        },
        {
          "line": 3,
          "message": "Failed to evaluate expression: exposed. exposed is not defined. Available variables: secret",
          "type": "expression",
        },
      ]
    `)
    expect(html).toMatchInlineSnapshot(`""`)
})

test('else if chain in an exported component', () => {
    const code = dedent`
        export function Rank({ n }) {
          if (n === 1) return <b>one</b>
          else if (n === 2) return <b>two</b>
          else return <b>other</b>
        }

        <Rank n={1} />
        <Rank n={2} />
        <Rank n={9} />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<b>one</b><b>two</b><b>other</b>"`)
})

test('bare return inside if stops the function', () => {
    const code = dedent`
        export function pick({ skip }) {
          if (skip) return
          return "kept"
        }

        {pick({ skip: true }) ? "wrong" : "empty"}/{pick({ skip: false })}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"<p>empty/kept</p>"`)
})

test('array param destructure works on strings', () => {
    const code = dedent`
        export function first([value]) {
          return value
        }

        {first("ab")}
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`[]`)
    expect(html).toMatchInlineSnapshot(`"a"`)
})

test('exports stay unevaluated when functions are off', () => {
    const code = dedent`
        export function Card({ title }) {
          return <div>{title}</div>
        }

        <Card title="Hi" />
    `

    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        modules: { react: React },
    })
    const html = renderToStaticMarkup(visitor.run())
    expect(visitor.errors).toMatchInlineSnapshot(`
      [
        {
          "line": 1,
          "message": "Unsupported named export "Card". Export declarations are not evaluated, so exported values and components are not available in the document.",
          "type": "expression",
        },
        {
          "line": 5,
          "message": "Unsupported jsx component Card",
          "type": "missing-component",
        },
      ]
    `)
    expect(html).toMatchInlineSnapshot(`""`)
})

test('bare function declaration without export is not valid MDX ESM', () => {
    const code = dedent`
        function Foo({ title }) {
          return <div>{title}</div>
        }

        <Foo title="x" />
    `

    expect(() => mdxParse(code)).toThrowErrorMatchingInlineSnapshot(`[2:3: Could not parse expression with acorn]`)
})

test('const component without export is treated as markdown, not a declaration', () => {
    const code = dedent`
        const Alert = ({ children }) => <div>{children}</div>

        <Alert>ok</Alert>
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "line": 3,
          "message": "Unsupported jsx component Alert",
          "type": "missing-component",
        },
      ]
    `)
    expect(html).toMatchInlineSnapshot(`"<p>const Alert = () =&gt; <div></div></p>"`)
})

test('export class component is not a supported page-scope component', () => {
    const code = dedent`
        export class Box {
          render() {
            return <div>nope</div>
          }
        }

        <Box />
    `

    const { html, errors } = renderExports(code)
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "line": 1,
          "message": "Unsupported named export. Export declarations are not evaluated, so exported values and components are not available in the document.",
          "type": "expression",
        },
        {
          "line": 7,
          "message": "Unsupported jsx component Box",
          "type": "missing-component",
        },
      ]
    `)
    expect(html).toMatchInlineSnapshot(`""`)
})

test('markdown after export requires a blank line or MDX treats it as ESM', () => {
    const code = [
        'export function Foo({ title }) {',
        '  return <div>{title}</div>',
        '}',
        '# Hi',
        '',
        '<Foo title="x" />',
    ].join('\n')

    expect(() => mdxParse(code)).toThrowErrorMatchingInlineSnapshot(`[4:2: Could not parse import/exports with acorn]`)
})
