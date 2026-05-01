// Tests for rendering markdown (not MDX) that contains raw HTML blocks.
// The remarkHtmlToMdx plugin is used as a pre-processing step to convert
// `html` AST nodes (produced by plain remark) into mdxJsx nodes before
// MdastToJsx ever sees them. This way linkedom stays out of the main bundle.
import dedent from 'dedent'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import { expect, test, describe } from 'vitest'
import type { Root } from 'mdast'
import { MdastToJsx } from './safe-mdx.tsx'
import { remarkHtmlToMdx } from './markdown.ts'
import { validHtmlElements } from './html/valid-html-elements.ts'

const components = {
    Heading({ children, ...props }) {
        return React.createElement('h1', props, children)
    },
}

// convertTagName that only keeps standard HTML elements, drops everything else.
// This mirrors what the old case 'html' did inside MdastToJsx.
const onlyValidHtml = ({ tagName }: { tagName: string }) =>
    validHtmlElements.has(tagName.toLowerCase()) ? tagName.toLowerCase() : ''

// Parse with plain remark + remarkHtmlToMdx pre-processor, then render via MdastToJsx.
// No html nodes remain by the time MdastToJsx sees the AST.
function render(markdown: string) {
    const processor = remark()
        .use(remarkGfm)
        .use(remarkHtmlToMdx, { convertTagName: onlyValidHtml })
    const mdast = processor.parse(markdown) as Root
    processor.runSync(mdast)
    const visitor = new MdastToJsx({ markdown, mdast, components })
    const result = visitor.run()
    const html = renderToStaticMarkup(result)
    return { errors: visitor.errors || [], html }
}

describe('remarkHtmlToMdx pre-processor with plain remark', () => {
    test('renders a block-level HTML div', () => {
        const { html, errors } = render(dedent`
            # Title

            <div class="box">hello world</div>

            Some paragraph after.
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<h1>Title</h1><div class="box">hello world</div><p>Some paragraph after.</p>"`)
    })

    test('inline HTML in a paragraph is split by remark into per-tag html nodes (known limitation)', () => {
        // remark parses inline HTML at tag boundaries, so <strong>bold</strong> becomes:
        //   html("<strong>") → empty element, text("bold"), html("</strong>") → dropped
        // Block-level HTML (own line + blank lines) is the only reliably handled case.
        const { html, errors } = render(
            'Some text with <strong>bold</strong> and <em>italic</em> inline.'
        )
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<p>Some text with <strong></strong>bold and <em></em>italic inline.</p>"`)
    })

    test('strips unknown custom elements but keeps their text children', () => {
        // <callout> is not in validHtmlElements, so the tag wrapper is dropped
        const { html, errors } = render(dedent`
            <callout icon="💡">
            Important note
            </callout>
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"Important note"`)
    })

    test('renders self-closing void element hr', () => {
        const { html, errors } = render(dedent`
            Before

            <hr>

            After
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<p>Before</p><hr/><p>After</p>"`)
    })

    test('renders HTML anchor with name attribute', () => {
        const { html, errors } = render(dedent`
            <a name="section-one"></a>

            ## Section One
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<p><a name="section-one"></a></p><h2>Section One</h2>"`)
    })

    test('converts class attribute to className', () => {
        // Note: span without blank-line separation is treated as inline HTML by remark —
        // the opening tag and text content become separate nodes (see inline limitation above).
        const { html, errors } = render(dedent`
            <span class="highlight">highlighted text</span>
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<p><span class="highlight"></span>highlighted text</p>"`)
    })

    test('renders a table from raw HTML', () => {
        const { html, errors } = render(dedent`
            <table>
            <tr><th>Name</th><th>Value</th></tr>
            <tr><td>foo</td><td>bar</td></tr>
            </table>
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<table><tr><th>Name</th><th>Value</th></tr><tr><td>foo</td><td>bar</td></tr></table>"`)
    })

    test('mixed markdown and HTML block', () => {
        const { html, errors } = render(dedent`
            ## My Section

            <div class="card">
            Card content here
            </div>

            Back to **markdown**.
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
        expect(html).toMatchInlineSnapshot(`"<h2>My Section</h2><div class="card">Card content here</div><p>Back to <strong>markdown</strong>.</p>"`)
    })

    test('without the plugin, html nodes are silently skipped by MdastToJsx', () => {
        // Verify the old case 'html' path is gone — without the plugin, html nodes are dropped
        const processor = remark().use(remarkGfm) // no remarkHtmlToMdx
        const mdast = processor.parse(dedent`
            <div class="box">hello world</div>
        `) as Root
        const visitor = new MdastToJsx({ markdown: '', mdast, components })
        const result = visitor.run()
        const html = renderToStaticMarkup(result)
        expect(html).toMatchInlineSnapshot(`""`)
    })
})
