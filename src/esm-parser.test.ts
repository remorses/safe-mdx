import { expect, test, describe } from 'vitest'
import { parseEsmImports, extractComponentInfo } from './esm-parser.js'
import { mdxParse, extractImports, resolveModulePath } from './parse.js'
import type { SafeMdxError } from './safe-mdx.js'

describe('parseEsmImports', () => {
    test('parses default imports from HTTPS URLs', () => {
        const code = `import MyComponent from 'https://esm.sh/some-component'`
        const mdast = mdxParse(code)
        const errors: SafeMdxError[] = []
        
        // Find the mdxjsEsm node
        const esmNode = mdast.children.find((node: any) => node.type === 'mdxjsEsm')
        const imports = parseEsmImports(esmNode, (err) => errors.push(err))

        expect(Array.from(imports.entries())).toMatchInlineSnapshot(`
          [
            [
              "MyComponent",
              "https://esm.sh/some-component",
            ],
          ]
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
    })

    test('parses named imports from HTTPS URLs', () => {
        const code = `import { Button, Card as MyCard } from 'https://esm.sh/ui-library'`
        const mdast = mdxParse(code)
        const errors: SafeMdxError[] = []
        
        const esmNode = mdast.children.find((node: any) => node.type === 'mdxjsEsm')
        const imports = parseEsmImports(esmNode, (err) => errors.push(err))

        expect(Array.from(imports.entries())).toMatchInlineSnapshot(`
          [
            [
              "Button",
              "https://esm.sh/ui-library#Button",
            ],
            [
              "MyCard",
              "https://esm.sh/ui-library#Card",
            ],
          ]
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
    })

    test('rejects non-HTTPS URLs', () => {
        const code = `
import Component1 from 'http://insecure.com/component'
import Component2 from 'file:///local/path'
import Component3 from './relative/path'
`
        const mdast = mdxParse(code)
        const errors: SafeMdxError[] = []
        
        mdast.children.forEach((node: any) => {
            if (node.type === 'mdxjsEsm') {
                parseEsmImports(node, (err) => errors.push(err))
            }
        })

        expect(errors).toMatchInlineSnapshot(`
          [
            {
              "line": 2,
              "message": "Invalid import URL: "http://insecure.com/component". Only HTTPS URLs are allowed for security reasons.",
              "type": "esm-import",
            },
            {
              "line": 2,
              "message": "Invalid import URL: "file:///local/path". Only HTTPS URLs are allowed for security reasons.",
              "type": "esm-import",
            },
            {
              "line": 2,
              "message": "Invalid import URL: "./relative/path". Only HTTPS URLs are allowed for security reasons.",
              "type": "esm-import",
            },
          ]
        `)
    })

    test('handles multiple import types in one statement', () => {
        const code = `import Default, { Named1, Named2 as Alias } from 'https://esm.sh/mixed-exports'`
        const mdast = mdxParse(code)
        const errors: SafeMdxError[] = []
        
        const esmNode = mdast.children.find((node: any) => node.type === 'mdxjsEsm')
        const imports = parseEsmImports(esmNode, (err) => errors.push(err))

        expect(Array.from(imports.entries())).toMatchInlineSnapshot(`
          [
            [
              "Default",
              "https://esm.sh/mixed-exports",
            ],
            [
              "Named1",
              "https://esm.sh/mixed-exports#Named1",
            ],
            [
              "Alias",
              "https://esm.sh/mixed-exports#Named2",
            ],
          ]
        `)
        expect(errors).toMatchInlineSnapshot(`[]`)
    })

    test('returns empty map when no estree data', () => {
        const errors: SafeMdxError[] = []
        const node = { type: 'mdxjsEsm', position: { start: { line: 1 } } }

        const imports = parseEsmImports(node, (err) => errors.push(err))

        expect(imports.size).toBe(0)
        expect(errors).toMatchInlineSnapshot(`[]`)
    })
})

describe('extractImports', () => {
    test('extracts named, default, and namespace imports', () => {
        const code = `import { Card } from './components/card'
import MyButton from '../ui/button'
import * as Utils from './utils'

# Hello
`
        const ast = mdxParse(code)
        const imports = extractImports(ast)
        expect(imports).toMatchInlineSnapshot(`
          [
            {
              "source": "./components/card",
              "specifiers": [
                {
                  "imported": "Card",
                  "local": "Card",
                  "type": "named",
                },
              ],
            },
            {
              "source": "../ui/button",
              "specifiers": [
                {
                  "imported": "default",
                  "local": "MyButton",
                  "type": "default",
                },
              ],
            },
            {
              "source": "./utils",
              "specifiers": [
                {
                  "imported": "*",
                  "local": "Utils",
                  "type": "namespace",
                },
              ],
            },
          ]
        `)
    })

    test('extracts npm package imports', () => {
        const code = `import { Button } from 'some-ui-lib'
import React from 'react'
`
        const ast = mdxParse(code)
        const imports = extractImports(ast)
        expect(imports).toMatchInlineSnapshot(`
          [
            {
              "source": "some-ui-lib",
              "specifiers": [
                {
                  "imported": "Button",
                  "local": "Button",
                  "type": "named",
                },
              ],
            },
            {
              "source": "react",
              "specifiers": [
                {
                  "imported": "default",
                  "local": "React",
                  "type": "default",
                },
              ],
            },
          ]
        `)
    })

    test('extracts absolute path imports (Mintlify style)', () => {
        const code = `import Greeting from "/snippets/greeting.mdx"
import { Badge } from "/components/badge"
`
        const ast = mdxParse(code)
        const imports = extractImports(ast)
        expect(imports).toMatchInlineSnapshot(`
          [
            {
              "source": "/snippets/greeting.mdx",
              "specifiers": [
                {
                  "imported": "default",
                  "local": "Greeting",
                  "type": "default",
                },
              ],
            },
            {
              "source": "/components/badge",
              "specifiers": [
                {
                  "imported": "Badge",
                  "local": "Badge",
                  "type": "named",
                },
              ],
            },
          ]
        `)
    })

    test('returns empty array when no imports', () => {
        const code = `# Just a heading\n\nSome text.`
        const ast = mdxParse(code)
        expect(extractImports(ast)).toMatchInlineSnapshot(`[]`)
    })

    test('handles aliased imports', () => {
        const code = `import { Card as MyCard, Badge as B } from './ui'`
        const ast = mdxParse(code)
        const imports = extractImports(ast)
        expect(imports).toMatchInlineSnapshot(`
          [
            {
              "source": "./ui",
              "specifiers": [
                {
                  "imported": "Card",
                  "local": "MyCard",
                  "type": "named",
                },
                {
                  "imported": "Badge",
                  "local": "B",
                  "type": "named",
                },
              ],
            },
          ]
        `)
    })
})

describe('resolveModulePath', () => {
    const keys = [
        './snippets/card.tsx',
        './snippets/badge.ts',
        './components/ui/index.tsx',
        './pages/api/helpers.ts',
        './pages/card.tsx',
        './snippets/greeting.mdx',
    ]

    test('resolves absolute import /snippets/card', () => {
        expect(resolveModulePath('/snippets/card', './pages/', keys))
            .toMatchInlineSnapshot(`"./snippets/card.tsx"`)
    })

    test('resolves relative import ./card from ./pages/', () => {
        expect(resolveModulePath('./card', './pages/', keys))
            .toMatchInlineSnapshot(`"./pages/card.tsx"`)
    })

    test('resolves index.tsx', () => {
        expect(resolveModulePath('/components/ui', './pages/', keys))
            .toMatchInlineSnapshot(`"./components/ui/index.tsx"`)
    })

    test('resolves relative ../ path', () => {
        expect(resolveModulePath('../snippets/greeting', './pages/api/', keys))
            .toMatchInlineSnapshot(`undefined`)
    })

    test('resolves ../../ to reach project root', () => {
        expect(resolveModulePath('../../snippets/greeting', './pages/api/', keys))
            .toMatchInlineSnapshot(`"./snippets/greeting.mdx"`)
    })

    test('returns undefined for bare specifiers', () => {
        expect(resolveModulePath('react', './pages/', keys))
            .toMatchInlineSnapshot(`undefined`)
    })

    test('returns undefined for missing files', () => {
        expect(resolveModulePath('./nonexistent', './pages/', keys))
            .toMatchInlineSnapshot(`undefined`)
    })
})

describe('extractComponentInfo', () => {
    test('extracts default import info', () => {
        const result = extractComponentInfo('https://esm.sh/component')
        expect(result).toMatchInlineSnapshot(`
          {
            "componentName": "default",
            "importUrl": "https://esm.sh/component",
          }
        `)
    })

    test('extracts named import info', () => {
        const result = extractComponentInfo('https://esm.sh/ui-library#Button')
        expect(result).toMatchInlineSnapshot(`
          {
            "componentName": "Button",
            "importUrl": "https://esm.sh/ui-library",
          }
        `)
    })
})