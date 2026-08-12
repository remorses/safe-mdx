import { test, expect, describe } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
    parseHtmlToMdxAst,
    htmlToMdxAst,
    remarkMdxJsxNormalize,
} from './html-to-mdx-ast.ts'
import { unified } from 'unified'
import remarkMdx from 'remark-mdx'
import remarkStringify from 'remark-stringify'
import remarkParse from 'remark-parse'
import type { RootContent } from 'mdast'
import { mdxParse } from '../parse.ts'
import { MdastToJsx } from '../safe-mdx.tsx'

// Default components for testing
const components = {
    Heading({ level, children, ...props }) {
        return React.createElement('h1', props, children)
    },
    Cards({ level, children, ...props }) {
        return React.createElement('div', props, children)
    },
}

// Helper to convert HTML to MDX string and rendered HTML
async function htmlToMdxString({
    html,
    withProcessor = false,
    onError,
    convertTagName,
    convertAttributeValue,
}: {
    html: string
    withProcessor?: boolean
    onError?: (error: unknown, text: string) => void
    convertTagName?: (args: { tagName: string }) => string
    convertAttributeValue?: (args: {
        name: string
        value: string
        tagName: string
    }) => string
}): Promise<{ mdx: string; html: string }> {
    // If withProcessor is true, create a textToMdast that parses markdown
    const textToMdast = withProcessor
        ? ({ text }: { text: string }) => {
              const markdownProcessor = unified()
                  .use(remarkParse)
                  .use(remarkMdx)
              const mdast = markdownProcessor.parse(text) as any
              markdownProcessor.runSync(mdast)
              // Return the children of the root node
              return mdast.children || []
          }
        : undefined

    const mdxAst = parseHtmlToMdxAst({
        html,
        textToMdast,
        onError,
        convertTagName,
        convertAttributeValue,
    })

    // Generate MDX string
    const processor = unified().use(remarkMdx).use(remarkStringify, {
        // bullet: '-',
        // fence: '`',
        // fences: true
    })

    // Create a root node with the content
    const root = {
        type: 'root',
        children: mdxAst,
    }

    const mdx = processor.stringify(root as any)

    // Generate HTML using MdastToJsx like in safe-mdx.test.tsx
    // First parse the MDX to get the full AST
    const mdast = mdxParse(mdx)
    const visitor = new MdastToJsx({ markdown: mdx, mdast, components })
    const jsx = visitor.run()
    const renderedHtml = renderToStaticMarkup(jsx)

    return { mdx, html: renderedHtml }
}

describe('parseHtmlToMdxAst', () => {
    test('parses simple HTML element', () => {
        const result = parseHtmlToMdxAst({ html: '<div>Hello</div>' })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "Hello",
                },
              ],
              "name": "div",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
    })

    test('filters out non-HTML elements when convertTagName returns empty string', () => {
        const result = parseHtmlToMdxAst({
            html: '<custom-element>Hello <span>world</span></custom-element>',
            convertTagName: ({ tagName }) => {
                // Only keep span, filter out custom-element
                if (tagName === 'span') return 'span'
                return tagName
            },
        })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "Hello",
                },
                {
                  "attributes": [],
                  "children": [
                    {
                      "type": "text",
                      "value": "world",
                    },
                  ],
                  "name": "span",
                  "type": "mdxJsxTextElement",
                },
              ],
              "name": "custom-element",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
    })

    test('handles self-closing tags', () => {
        const result = parseHtmlToMdxAst({
            html: '<img src="https://example.com/img.jpg" />',
        })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [
                {
                  "name": "src",
                  "type": "mdxJsxAttribute",
                  "value": "https://example.com/img.jpg",
                },
              ],
              "children": [],
              "name": "img",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
    })

    test('handles span with attributes', () => {
        const result = parseHtmlToMdxAst({
            html: '<span color="blue">colored text</span>',
        })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [
                {
                  "name": "color",
                  "type": "mdxJsxAttribute",
                  "value": "blue",
                },
              ],
              "children": [
                {
                  "type": "text",
                  "value": "colored text",
                },
              ],
              "name": "span",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
    })

    test('handles mixed content', () => {
        const result = parseHtmlToMdxAst({
            html: 'Some text <strong>bold</strong> more text',
        })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "type": "text",
              "value": "Some text",
            },
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "bold",
                },
              ],
              "name": "strong",
              "type": "mdxJsxTextElement",
            },
            {
              "type": "text",
              "value": "more text",
            },
          ]
        `)
    })

    test('handles comments', () => {
        const result = parseHtmlToMdxAst({ html: '<!-- This is a comment -->' })
        expect(result).toMatchInlineSnapshot(`[]`)
    })

    test('handles table with attributes', () => {
        const result = parseHtmlToMdxAst({
            html: '<table class="data-table"><tr><td>Cell</td></tr></table>',
        })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [
                {
                  "name": "className",
                  "type": "mdxJsxAttribute",
                  "value": "data-table",
                },
              ],
              "children": [
                {
                  "attributes": [],
                  "children": [
                    {
                      "attributes": [],
                      "children": [
                        {
                          "type": "text",
                          "value": "Cell",
                        },
                      ],
                      "name": "td",
                      "type": "mdxJsxTextElement",
                    },
                  ],
                  "name": "tr",
                  "type": "mdxJsxTextElement",
                },
              ],
              "name": "table",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
    })
})

describe('parseHtmlToMdxAst with markdown processor', () => {
    test('parses markdown inside HTML tags', async () => {
        const htmlToConvert = '<div>This is **bold** text</div>'
        const result = await htmlToMdxString({
            html: htmlToConvert,
            withProcessor: true,
            onError: (e) => {
                throw e
            },
        })
        expect(result).toMatchInlineSnapshot(`
          {
            "html": "<div>This is <strong>bold</strong> text</div>",
            "mdx": "<div>This is **bold** text</div>
          ",
          }
        `)
    })

    test('handles mixed markdown and HTML inside tags', async () => {
        const htmlToConvert = '<div>**Bold text:** <a href="#">link</a></div>'
        const result = await htmlToMdxString({
            html: htmlToConvert,
            withProcessor: true,
            onError: (e) => {
                throw e
            },
        })
        expect(result).toMatchInlineSnapshot(`
          {
            "html": "<div><strong>Bold text:</strong><a href="#">link</a></div>",
            "mdx": "<div>**Bold text:**<a href="#">link</a></div>
          ",
          }
        `)
    })

    test('handles markdown inside table cells', async () => {
        const htmlToConvert =
            '<table><tr><td>**Bold** text and [link](http://example.com)</td></tr></table>'
        const result = await htmlToMdxString({
            html: htmlToConvert,
            withProcessor: true,
            onError: (e) => {
                throw e
            },
        })
        expect(result).toMatchInlineSnapshot(`
          {
            "html": "<table><tr><td><strong>Bold</strong> text and <a href="http://example.com" title="">link</a></td></tr></table>",
            "mdx": "<table><tr><td>**Bold** text and [link](http://example.com)</td></tr></table>
          ",
          }
        `)
    })

    test('preserves plain text when no markdown', async () => {
        const htmlToConvert = '<div>Plain text without markdown</div>'
        const result = await htmlToMdxString({
            html: htmlToConvert,
            withProcessor: true,
            onError: (e) => {
                throw e
            },
        })
        expect(result).toMatchInlineSnapshot(`
          {
            "html": "<div>Plain text without markdown</div>",
            "mdx": "<div>Plain text without markdown</div>
          ",
          }
        `)
    })

    test('handles nested HTML tags with markdown', async () => {
        const htmlToConvert =
            '<div><span>**Bold** and <a href="#">link</a></span></div>'
        const result = await htmlToMdxString({
            html: htmlToConvert,
            withProcessor: true,
            onError: (e) => {
                throw e
            },
        })
        expect(result).toMatchInlineSnapshot(`
          {
            "html": "<div><span><strong>Bold</strong> and<a href="#">link</a></span></div>",
            "mdx": "<div><span>**Bold** and<a href="#">link</a></span></div>
          ",
          }
        `)
    })

    test('normalize plugin without parentType does not apply', () => {
        // Without parentType, normalization should not happen
        const withoutParent = htmlToMdxAst({ 
            html: '<span>Text</span>'
        })
        // Without normalization, elements remain as initially created (text elements)
        expect(withoutParent).toHaveLength(1)
        expect(withoutParent[0]).toMatchObject({
            type: 'mdxJsxTextElement',
            name: 'span'
        })
    })

    test('handles indented HTML without preserving indentation', () => {
        const indentedHtml = `
        <columns>
            <column>
                <page url="https://notion.so/page1">Page 1</page>
                Some text
            </column>
            <column>
                <callout icon="💡" color="yellow_bg">
                    Important callout
                </callout>
            </column>
        </columns>`
        
        const result = parseHtmlToMdxAst({ html: indentedHtml })
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "attributes": [],
                  "children": [
                    {
                      "attributes": [
                        {
                          "name": "url",
                          "type": "mdxJsxAttribute",
                          "value": "https://notion.so/page1",
                        },
                      ],
                      "children": [
                        {
                          "type": "text",
                          "value": "Page 1",
                        },
                      ],
                      "name": "page",
                      "type": "mdxJsxTextElement",
                    },
                    {
                      "type": "text",
                      "value": "Some text",
                    },
                  ],
                  "name": "column",
                  "type": "mdxJsxTextElement",
                },
                {
                  "attributes": [],
                  "children": [
                    {
                      "attributes": [
                        {
                          "name": "icon",
                          "type": "mdxJsxAttribute",
                          "value": "💡",
                        },
                        {
                          "name": "color",
                          "type": "mdxJsxAttribute",
                          "value": "yellow_bg",
                        },
                      ],
                      "children": [
                        {
                          "type": "text",
                          "value": "Important callout",
                        },
                      ],
                      "name": "callout",
                      "type": "mdxJsxTextElement",
                    },
                  ],
                  "name": "column",
                  "type": "mdxJsxTextElement",
                },
              ],
              "name": "columns",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
    })

    test('handles indented HTML with textToMdast', () => {
        const indentedHtml = `
        <div>
            **Bold text** and
            some regular text
        </div>`
        
        const receivedTexts: string[] = []
        const textToMdast = ({ text }: { text: string }) => {
            receivedTexts.push(text)
            return [{ type: 'text', value: text } as RootContent]
        }
        
        const result = parseHtmlToMdxAst({ 
            html: indentedHtml,
            textToMdast
        })
        
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "**Bold text** and
          some regular text",
                },
              ],
              "name": "div",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
        
        expect(receivedTexts).toMatchInlineSnapshot(`
          [
            "**Bold text** and
          some regular text",
          ]
        `)
    })

    test('handles multi-line indented text content', () => {
        const htmlWithMultiLineText = `
            <div>
                This is a multi-line string
                that has indentation on each line
                and should be properly de-indented
                
                Even with blank lines in between
                it should maintain the structure
            </div>`
        
        const receivedTexts: string[] = []
        const textToMdast = ({ text }: { text: string }) => {
            receivedTexts.push(text)
            return [{ type: 'text', value: text } as RootContent]
        }
        
        const result = parseHtmlToMdxAst({ 
            html: htmlWithMultiLineText,
            textToMdast
        })
        
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "This is a multi-line string
          that has indentation on each line
          and should be properly de-indented
          
          Even with blank lines in between
          it should maintain the structure",
                },
              ],
              "name": "div",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
        
        expect(receivedTexts).toMatchInlineSnapshot(`
          [
            "This is a multi-line string
          that has indentation on each line
          and should be properly de-indented
          
          Even with blank lines in between
          it should maintain the structure",
          ]
        `)
    })

    test('handles multi-line text with markdown', () => {
        const htmlWithMultiLineText = `
            <article>
                # Heading
                
                This is a paragraph with **bold** text
                that spans multiple lines and has
                markdown formatting.
                
                - List item 1
                - List item 2
            </article>`
        
        const receivedTexts: string[] = []
        const textToMdast = ({ text }: { text: string }) => {
            receivedTexts.push(text)
            return [{ type: 'text', value: text } as RootContent]
        }
        
        const result = parseHtmlToMdxAst({ 
            html: htmlWithMultiLineText,
            textToMdast
        })
        
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "# Heading
          
          This is a paragraph with **bold** text
          that spans multiple lines and has
          markdown formatting.
          
          - List item 1
          - List item 2",
                },
              ],
              "name": "article",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
        
        expect(receivedTexts).toMatchInlineSnapshot(`
          [
            "# Heading
          
          This is a paragraph with **bold** text
          that spans multiple lines and has
          markdown formatting.
          
          - List item 1
          - List item 2",
          ]
        `)
    })

    test('preserves relative indentation when deindenting', () => {
        const htmlWithRelativeIndent = `
            <pre>
                function example() {
                    if (true) {
                        console.log('nested');
                    }
                }
            </pre>`
        
        const receivedTexts: string[] = []
        const textToMdast = ({ text }: { text: string }) => {
            receivedTexts.push(text)
            return [{ type: 'text', value: text } as RootContent]
        }
        
        const result = parseHtmlToMdxAst({ 
            html: htmlWithRelativeIndent,
            textToMdast
        })
        
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "attributes": [],
              "children": [
                {
                  "type": "text",
                  "value": "function example() {
              if (true) {
                  console.log('nested');
              }
          }",
                },
              ],
              "name": "pre",
              "type": "mdxJsxTextElement",
            },
          ]
        `)
        
        expect(receivedTexts).toMatchInlineSnapshot(`
          [
            "function example() {
              if (true) {
                  console.log('nested');
              }
          }",
          ]
        `)
    })

    test('applies normalize plugin with parentType', () => {
        // Test with a block element inside a paragraph (phrasing context)
        const blockInParagraph = htmlToMdxAst({ 
            html: '<div>Block in paragraph</div>',
            parentType: 'paragraph'
        })
        // Even though div is a block element, it should remain mdxJsxFlowElement
        // because block-level tags have priority
        expect(blockInParagraph).toHaveLength(1)
        expect(blockInParagraph[0]).toMatchObject({
            type: 'mdxJsxFlowElement',
            name: 'div'
        })

        // Test with inline element in paragraph (should be text element)
        const inlineInParagraph = htmlToMdxAst({ 
            html: '<span>Inline in paragraph</span>',
            parentType: 'paragraph'
        })
        expect(inlineInParagraph).toHaveLength(1)
        expect(inlineInParagraph[0]).toMatchObject({
            type: 'mdxJsxTextElement',
            name: 'span'
        })

        // Test with inline element in root (should be flow element)
        const inlineInRoot = htmlToMdxAst({ 
            html: '<span>Inline in root</span>',
            parentType: 'root'
        })
        expect(inlineInRoot).toHaveLength(1)
        expect(inlineInRoot[0]).toMatchObject({
            type: 'mdxJsxFlowElement', 
            name: 'span'
        })

        // Test with multiple elements
        const multipleElements = htmlToMdxAst({ 
            html: '<span>First</span><div>Second</div>',
            parentType: 'paragraph'
        })
        expect(multipleElements).toHaveLength(2)
        expect(multipleElements[0]).toMatchObject({
            type: 'mdxJsxTextElement',
            name: 'span'
        })
        expect(multipleElements[1]).toMatchObject({
            type: 'mdxJsxFlowElement', // div is block-level
            name: 'div'
        })

        // Test with nested elements - the normalize plugin should handle nested context correctly
        const nestedElements = htmlToMdxAst({ 
            html: '<div><span>Nested span</span><p><em>Emphasis</em></p></div>',
            parentType: 'root'
        })
        
        // The plugin normalizes based on the entire tree structure
        expect(nestedElements).toHaveLength(1)
        expect(nestedElements[0]).toMatchObject({
            type: 'mdxJsxFlowElement',
            name: 'div',
            children: expect.arrayContaining([
                expect.objectContaining({
                    type: 'mdxJsxFlowElement', // span in div (flow container) becomes flow  
                    name: 'span'
                }),
                expect.objectContaining({
                    type: 'mdxJsxFlowElement',
                    name: 'p',
                    children: expect.arrayContaining([
                        expect.objectContaining({
                            type: 'mdxJsxTextElement', // em in paragraph (phrasing container) becomes text
                            name: 'em'
                        })
                    ])
                })
            ])
        })
    })

    test('block-level HTML elements as direct children of root should be flow elements', () => {
        // Test that wrapper outer HTML elements that are direct children of root 
        // should be flow elements, not text elements
        const htmlWithNestedBlocks = htmlToMdxAst({ 
            html: `<div class="wrapper">
                <h1>Title</h1>
                <p>Some content</p>
                <section>
                    <h2>Subtitle</h2>
                </section>
            </div>
            <article>
                <header>Header</header>
                <main>Content</main>
            </article>`,
            parentType: 'root'
        })

        // All block-level elements at root should be flow elements
        expect(htmlWithNestedBlocks).toHaveLength(2)
        
        // First element: div wrapper
        expect(htmlWithNestedBlocks[0]).toMatchObject({
            type: 'mdxJsxFlowElement',
            name: 'div'
        })
        
        // Second element: article
        expect(htmlWithNestedBlocks[1]).toMatchObject({
            type: 'mdxJsxFlowElement',
            name: 'article'
        })

        // Test with various block-level tags
        const blockTags = ['div', 'article', 'section', 'header', 'main', 'footer', 'aside', 'nav']
        blockTags.forEach(tag => {
            const result = htmlToMdxAst({ 
                html: `<${tag}>Content</${tag}>`,
                parentType: 'root'
            })
            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({
                type: 'mdxJsxFlowElement',
                name: tag
            })
        })
    })
})
