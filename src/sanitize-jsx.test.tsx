import dedent from 'dedent'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { mdxParse } from './parse.ts'
import { MdastToJsx } from './safe-mdx.tsx'

function render(
    code: string,
    sanitize = true,
    extra?: { scope?: Record<string, any> },
) {
    const mdast = mdxParse(code)
    const visitor = new MdastToJsx({
        markdown: code,
        mdast,
        sanitize,
        evaluateOptions: { functions: false },
        components: {
            Heading({ children, ...props }) {
                return <h1 {...props}>{children}</h1>
            },
        },
        scope: extra?.scope,
    })
    const result = visitor.run()
    return {
        html: renderToStaticMarkup(result),
        errors: visitor.errors,
    }
}

test('sanitize off still emits script tags', () => {
    const { html, errors } = render(`<script>alert(1)</script>`, false)
    expect(errors).toEqual([])
    expect(html).toContain('<script>alert(1)</script>')
})

test('drops script tags', () => {
    const { html } = render(`<script>alert(1)</script>`)
    expect(html).not.toContain('<script>')
    expect(html).toMatchInlineSnapshot(`""`)
})

test('drops script src', () => {
    const { html } = render(`<script src="https://evil.com/x.js"></script>`)
    expect(html).not.toContain('<script')
    expect(html).toMatchInlineSnapshot(`""`)
})

test('strips dangerouslySetInnerHTML on native tags', () => {
    const { html } = render(
        `<div dangerouslySetInnerHTML={{__html: '<img src=x onerror=alert(1)>'}} />`,
    )
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
    expect(html).toMatchInlineSnapshot(`"<div></div>"`)
})

test('strips dangerouslySetInnerHTML from spreads', () => {
    const { html } = render(
        `<div {...{dangerouslySetInnerHTML: {__html: '<img src=x onerror=alert(1)>'}}} />`,
    )
    expect(html).not.toContain('onerror')
    expect(html).toMatchInlineSnapshot(`"<div></div>"`)
})

test('strips dangerouslySetInnerHTML on custom components', () => {
    const { html } = render(
        `<Heading dangerouslySetInnerHTML={{__html: '<img src=x onerror=alert(1)>'}} />`,
    )
    expect(html).not.toContain('onerror')
    expect(html).toMatchInlineSnapshot(`"<h1></h1>"`)
})

test('keeps https iframes and strips srcDoc', () => {
    const remote = render(`<iframe src="https://example.com"></iframe>`)
    const srcDoc = render(`<iframe srcDoc="<script>alert(1)</script>"></iframe>`)
    expect(remote.html).toContain('src="https://example.com"')
    expect(srcDoc.html).toContain('<iframe')
    expect(srcDoc.html).not.toContain('srcDoc')
    expect(srcDoc.html).not.toContain('srcdoc')
})

test('strips javascript and data iframe src', () => {
    const js = render(`<iframe src="javascript:alert(1)"></iframe>`)
    const data = render(`<iframe src="data:text/html,<script>alert(1)</script>"></iframe>`)
    expect(js.html).not.toMatch(/javascript:/i)
    expect(data.html).not.toMatch(/data:text\/html/i)
})

test('strips javascript href on jsx and markdown links', () => {
    const jsx = render(`<a href="javascript:alert(1)">click</a>`)
    const markdown = render(`[click](javascript:alert(1))`)
    const concat = render(`<a href={"java" + "script:alert(1)"}>click</a>`)
    expect(jsx.html).not.toMatch(/javascript:/i)
    expect(markdown.html).not.toMatch(/javascript:/i)
    expect(concat.html).not.toMatch(/javascript:/i)
    expect({ jsx: jsx.html, markdown: markdown.html, concat: concat.html }).toMatchInlineSnapshot(`
      {
        "concat": "<a>click</a>",
        "jsx": "<a>click</a>",
        "markdown": "<p><a title="">click</a></p>",
      }
    `)
})

test('strips vbscript href', () => {
    const { html } = render(`<a href="vbscript:msgbox(1)">x</a>`)
    expect(html).not.toMatch(/vbscript:/i)
    expect(html).toMatchInlineSnapshot(`"<a>x</a>"`)
})



test('keeps inline style objects', () => {
    const { html, errors } = render(
        `<div style={{color: 'red', fontSize: '16px'}}>hi</div>`,
    )
    expect(errors.filter((e) => e.type === 'sanitize')).toEqual([])
    expect(html).toContain('style="color:red;font-size:16px"')
})

test('allows https links and images', () => {
    const { html, errors } = render(dedent`
        [ok](https://example.com)

        <img src="https://example.com/x.png" alt="x" />
    `)
    expect(errors.filter((e) => e.type === 'sanitize')).toEqual([])
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('src="https://example.com/x.png"')
})

test('strips javascript srcSet', () => {
    const { html } = render(`<img srcSet="javascript:alert(1) 1x" />`)
    expect(html).not.toMatch(/javascript:/i)
    expect(html).toMatchInlineSnapshot(`"<img/>"`)
})

test('strips native event handler props', () => {
    const { html, errors } = render(
        `<img src="https://example.com/x.png" onError={leak} />`,
        true,
        { scope: { leak: () => 'stolen' } },
    )
    expect(html).not.toContain('onError')
    expect(errors.some((e) => e.type === 'sanitize')).toBe(true)
    expect(html).toMatchInlineSnapshot(`"<link rel="preload" as="image" href="https://example.com/x.png"/><img src="https://example.com/x.png"/>"`)
})

test('strips form action javascript', () => {
    const { html } = render(`<form action="javascript:alert(1)"><button>go</button></form>`)
    expect(html).not.toMatch(/javascript:/i)
    expect(html).toMatchInlineSnapshot(`"<form><button>go</button></form>"`)
})

test('drops base meta and link', () => {
    const { html } = render(dedent`
        <base href="https://evil.com/" />
        <meta httpEquiv="refresh" content="0;url=https://evil.com" />
        <link rel="stylesheet" href="https://evil.com/x.css" />
    `)
    expect(html).not.toContain('<base')
    expect(html).not.toContain('<meta')
    expect(html).not.toContain('<link')
    expect(html).toMatchInlineSnapshot(`""`)
})

test('keeps style tags with string children', () => {
    const { html, errors } = render(`<style>{"body{color:red}"}</style>`)
    expect(errors.filter((e) => e.type === 'sanitize')).toEqual([])
    expect(html).toContain('<style>body{color:red}</style>')
})

test('drops object and embed', () => {
    const { html } = render(dedent`
        <object data="javascript:alert(1)"></object>
        <embed src="https://evil.com" />
    `)
    expect(html).not.toContain('<object')
    expect(html).not.toContain('<embed')
    expect(html).toMatchInlineSnapshot(`""`)
})

test('does not treat text children as html', () => {
    const { html } = render(`{ '<img src=x onerror=alert(1)>' }`)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
})

test('allows image data urls and strips other data urls', () => {
    const ok = render(`<img src="data:image/png;base64,aaaa" />`)
    const bad = render(`<img src="data:text/html,<script>alert(1)</script>" />`)
    expect(ok.html).toContain('data:image/png;base64,aaaa')
    expect(bad.html).not.toContain('data:text/html')
})

test('allows mailto links', () => {
    const { html } = render(`<a href="mailto:hi@example.com">mail</a>`)
    expect(html).toContain('href="mailto:hi@example.com"')
})

test('denied source tags are dropped even when the host overrides the native tag', () => {
    const mdast = mdxParse(`<script>alert(1)</script>`)
    const visitor = new MdastToJsx({
        markdown: '',
        mdast,
        sanitize: true,
        components: {
            script: (props) => <script {...props} />,
        },
    })
    const html = renderToStaticMarkup(visitor.run())
    expect(html).not.toContain('<script')
    expect(visitor.errors.some((e) => e.type === 'sanitize')).toBe(true)
})

test('unsafe urls are stripped on native tag overrides', () => {
    const mdast = mdxParse(`<a href="vbscript:msgbox(1)">click</a>`)
    const visitor = new MdastToJsx({
        markdown: '',
        mdast,
        sanitize: true,
        components: {
            a: (props) => <a {...props} />,
        },
    })
    const html = renderToStaticMarkup(visitor.run())
    expect(html).not.toMatch(/vbscript:/i)
    expect(html).toContain('click')
})

test('keeps commas inside a data image srcSet', () => {
    const { html } = render(`<img srcSet="data:image/png;base64,aaaa 1x" />`)
    expect(html).toContain('data:image/png;base64,aaaa')
    expect(html).not.toMatch(/srcSet="aaaa/)
})
