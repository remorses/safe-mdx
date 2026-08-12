// Verifies segment-cached parsing for streaming MDX without tying the API to React rendering.
import { describe, expect, test } from 'vitest'

import { mdxParse } from './parse.ts'
import { createMdxProcessor, parseMarkdownIncremental, type SegmentCache } from './incremental-parse.ts'

function nodeSummary(ast: any) {
    return ast.children.map((node: any) => ({
        type: node.type,
        value: node.value,
        name: node.name,
        start: node.position?.start,
        end: node.position?.end,
    }))
}

describe('parseMarkdownIncremental', () => {
    test('parses MDX into an mdast root and reports no errors', () => {
        const cache: SegmentCache = new Map()
        const result = parseMarkdownIncremental({
            markdown: '# Hello\n\n<Alert>streaming</Alert>\n\nTail',
            cache,
            trailingNodes: 1,
        })

        expect(result.errors).toMatchInlineSnapshot(`[]`)
        expect(nodeSummary(result.mdast)).toMatchInlineSnapshot(`
          [
            {
              "end": {
                "column": 8,
                "line": 1,
                "offset": 7,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 1,
                "offset": 0,
              },
              "type": "heading",
              "value": undefined,
            },
            {
              "end": {
                "column": 25,
                "line": 3,
                "offset": 33,
              },
              "name": "Alert",
              "start": {
                "column": 1,
                "line": 3,
                "offset": 9,
              },
              "type": "mdxJsxFlowElement",
              "value": undefined,
            },
            {
              "end": {
                "column": 5,
                "line": 5,
                "offset": 39,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 5,
                "offset": 35,
              },
              "type": "paragraph",
              "value": undefined,
            },
          ]
        `)
        expect(Array.from(cache.keys())).toMatchInlineSnapshot(`
          [
            0,
            7,
          ]
        `)
    })

    test('reuses cached stable segments', () => {
        const cache: SegmentCache = new Map()
        let parseCalls = 0
        const parse = (markdown: string) => {
            parseCalls++
            return mdxParse(markdown)
        }

        parseMarkdownIncremental({
            markdown: '# Title\n\nFirst paragraph\n\nSecond paragraph',
            cache,
            trailingNodes: 0,
            parse,
        })
        parseMarkdownIncremental({
            markdown: '# Title\n\nFirst paragraph\n\nSecond paragraph',
            cache,
            trailingNodes: 0,
            parse,
        })

        expect(parseCalls).toMatchInlineSnapshot(`1`)
        expect(Array.from(cache.entries()).map(([start, entry]) => ({ start, end: entry.end }))).toMatchInlineSnapshot(`
          [
            {
              "end": 7,
              "start": 0,
            },
            {
              "end": 24,
              "start": 7,
            },
            {
              "end": 42,
              "start": 24,
            },
          ]
        `)
    })

    test('keeps positions correct after cached prefixes', () => {
        const cache: SegmentCache = new Map()

        parseMarkdownIncremental({
            markdown: '# Title\n\nFirst paragraph\n\nLive',
            cache,
            trailingNodes: 1,
        })
        const result = parseMarkdownIncremental({
            markdown: '# Title\n\nFirst paragraph\n\nLive tail\n\nNew paragraph',
            cache,
            trailingNodes: 1,
        })

        expect(result.errors).toMatchInlineSnapshot(`[]`)
        expect(nodeSummary(result.mdast)).toMatchInlineSnapshot(`
          [
            {
              "end": {
                "column": 8,
                "line": 1,
                "offset": 7,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 1,
                "offset": 0,
              },
              "type": "heading",
              "value": undefined,
            },
            {
              "end": {
                "column": 16,
                "line": 3,
                "offset": 24,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 3,
                "offset": 9,
              },
              "type": "paragraph",
              "value": undefined,
            },
            {
              "end": {
                "column": 10,
                "line": 5,
                "offset": 35,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 5,
                "offset": 26,
              },
              "type": "paragraph",
              "value": undefined,
            },
            {
              "end": {
                "column": 14,
                "line": 7,
                "offset": 50,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 7,
                "offset": 37,
              },
              "type": "paragraph",
              "value": undefined,
            },
          ]
        `)
    })

    test('returns partial cached AST instead of throwing on invalid live tail', () => {
        const cache: SegmentCache = new Map()

        parseMarkdownIncremental({
            markdown: '# Stable\n\nDone\n\nTail',
            cache,
            trailingNodes: 1,
        })
        const result = parseMarkdownIncremental({
            markdown: '# Stable\n\nDone\n\n<Card',
            cache,
            trailingNodes: 1,
        })

        expect(result.errors.map((error) => ({
            message: error.message,
            line: error.line,
            column: error.column,
            offset: error.offset,
        }))).toMatchInlineSnapshot(`
          [
            {
              "column": 6,
              "line": 5,
              "message": "Unexpected end of file in name, expected a name character such as letters, digits, \`$\`, or \`_\`; whitespace before attributes; or the end of the tag",
              "offset": 21,
            },
          ]
        `)
        expect(nodeSummary(result.mdast)).toMatchInlineSnapshot(`
          [
            {
              "end": {
                "column": 9,
                "line": 1,
                "offset": 8,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 1,
                "offset": 0,
              },
              "type": "heading",
              "value": undefined,
            },
            {
              "end": {
                "column": 5,
                "line": 3,
                "offset": 14,
              },
              "name": undefined,
              "start": {
                "column": 1,
                "line": 3,
                "offset": 10,
              },
              "type": "paragraph",
              "value": undefined,
            },
          ]
        `)
    })

    test('uses custom processor plugins', () => {
        const cache: SegmentCache = new Map()
        const processor = createMdxProcessor({
            remarkPlugins: [remarkUppercaseText],
        })

        const result = parseMarkdownIncremental({
            markdown: 'hello **world**',
            cache,
            processor,
        })

        expect(result.errors).toMatchInlineSnapshot(`[]`)
        expect(textValues(result.mdast)).toMatchInlineSnapshot(`
          [
            "HELLO ",
            "WORLD",
          ]
        `)
    })
})

function remarkUppercaseText() {
    return (tree: any) => {
        walk(tree, (node) => {
            if (node.type === 'text') {
                node.value = node.value.toUpperCase()
            }
        })
    }
}

function textValues(node: any): string[] {
    const values: string[] = []
    walk(node, (child) => {
        if (child.type === 'text') values.push(child.value)
    })
    return values
}

function walk(node: any, visit: (node: any) => void) {
    visit(node)
    if (Array.isArray(node.children)) {
        for (const child of node.children) walk(child, visit)
    }
}
