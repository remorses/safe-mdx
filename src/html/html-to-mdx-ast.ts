import type { Root, RootContent, Text as MdastText } from 'mdast'
import type {
    MdxJsxAttribute,
    MdxJsxAttributeValueExpression,
    MdxJsxTextElement,
} from 'mdast-util-mdx-jsx'
import type { Processor } from 'unified'
import { unified } from 'unified'
import { convertAttributeNameToJSX } from './convert-attributes.ts'
import { parseHTML } from './domparser.ts'
import { remarkMdxJsxNormalize } from './remark-mdx-jsx-normalize.ts'

// Re-export the normalize plugin
export { remarkMdxJsxNormalize }

// Type for converting tag names
export type ConvertTagName = (args: { tagName: string }) => string

// Type for converting text to mdast nodes - now returns AST nodes directly
export type TextToMdast = (args: {
    text: string
}) => RootContent | RootContent[]

// Type for converting attribute values
export type ConvertAttributeValue = (args: {
    name: string
    value: string
    tagName: string
}) => string

// Options for parsing HTML to MDX AST
export interface ParseHtmlToMdxAstOptions {
    html: string
    parentType?: string
    onError?: (error: unknown, text: string) => void
    convertTagName?: ConvertTagName
    textToMdast?: TextToMdast
    convertAttributeValue?: ConvertAttributeValue
}

// Type guard functions for DOM nodes
function isCommentNode(node: Node): node is Comment {
    return node.nodeType === 8 // Node.COMMENT_NODE
}

function isTextNode(node: Node): node is Text {
    return node.nodeType === 3 // Node.TEXT_NODE
}

function isElementNode(node: Node): node is Element {
    return node.nodeType === 1 // Node.ELEMENT_NODE
}

// Default tag name converter (no transformation)
function defaultConvertTagName({ tagName }: { tagName: string }): string {
    return tagName.toLowerCase()
}

// Default attribute value converter (no transformation)
function defaultConvertAttributeValue({
    value,
}: {
    name: string
    value: string
    tagName: string
}): string {
    return value
}


// Remove common indentation from multi-line text while preserving relative indentation
function deindent(text: string): string {
    const lines = text.split('\n')

    // Find minimum indentation (excluding empty lines)
    let minIndent = Infinity
    for (const line of lines) {
        if (line.trim()) {
            const match = line.match(/^(\s*)/)
            if (match) {
                minIndent = Math.min(minIndent, match[1].length)
            }
        }
    }

    // If no indentation found, return as is
    if (minIndent === 0 || minIndent === Infinity) {
        return text
    }

    // Remove common indentation from each line, preserving relative indentation
    return lines
        .map(line => line.slice(minIndent))
        .join('\n')
}

// Convert HTML attribute to MDX JSX attribute
function convertAttribute(
    attr: Attr,
    tagName: string,
    options?: ParseHtmlToMdxAstOptions,
): MdxJsxAttribute {
    let jsxName = convertAttributeNameToJSX(attr.name)

    // Apply attribute value transformation
    const convertAttrValue =
        options?.convertAttributeValue || defaultConvertAttributeValue
    let value = convertAttrValue({
        name: attr.name,
        value: attr.value,
        tagName,
    })

    // Handle boolean attributes
    if (value === '' || value === attr.name) {
        return {
            type: 'mdxJsxAttribute',
            name: jsxName,
            value: null, // boolean true
        }
    }

    // Handle special number attributes
    const numberAttrs = [
        'tabIndex',
        'cols',
        'rows',
        'size',
        'span',
        'colSpan',
        'rowSpan',
        'border',
    ]
    if (numberAttrs.includes(jsxName) && value && !isNaN(Number(value))) {
        return {
            type: 'mdxJsxAttribute',
            name: jsxName,
            value: {
                type: 'mdxJsxAttributeValueExpression',
                value: value,
                data: {
                    estree: {
                        type: 'Program',
                        sourceType: 'module',
                        body: [
                            {
                                type: 'ExpressionStatement',
                                expression: {
                                    type: 'Literal',
                                    value: Number(value),
                                },
                            },
                        ],
                    },
                },
            } satisfies MdxJsxAttributeValueExpression,
        }
    }

    // Handle style attribute - for now keep as string
    // if (jsxName === 'style' && value.includes(':')) {
    //     // Could enhance to parse CSS to object
    //     return {
    //         type: 'mdxJsxAttribute',
    //         name: jsxName,
    //         value: {
    //             type: 'mdxJsxAttributeValueExpression',
    //             value: `{${JSON.stringify(parseStyleString(value))}}`,
    //             data: {
    //                 estree: parseExpression(JSON.stringify(parseStyleString(value))),
    //             },
    //         },
    //     }
    // }

    // String value
    return {
        type: 'mdxJsxAttribute',
        name: jsxName,
        value: value,
    }
}

// Convert DOM node to MDX AST nodes - always returns an array
function htmlNodeToMdxAst(
    node: Node,
    options?: ParseHtmlToMdxAstOptions,
): RootContent[] {
    if (isCommentNode(node)) {
        // Convert comments to MDX JSX expression with comment
        // For now, return empty array
        // return [{
        //     type: 'html',
        //     value: `<!-- ${node.data} -->`
        // }] as Html[]
        return []
    }

    if (isTextNode(node)) {
        let textValue = node.textContent || ''

        // Skip whitespace-only nodes between elements
        if (!textValue.trim()) {
            const prevSibling = node.previousSibling
            const nextSibling = node.nextSibling

            // If between elements and contains newlines, it's likely formatting
            if (textValue.includes('\n') &&
                ((prevSibling && isElementNode(prevSibling)) ||
                 (nextSibling && isElementNode(nextSibling)))) {
                return []
            }
            // Otherwise preserve the whitespace (could be intentional space)
        }

        // Always deindent text content
        textValue = deindent(textValue).trim()

        // Skip empty text after processing
        if (!textValue) {
            return []
        }

        // If we have a textToMdast converter, use it
        if (options?.textToMdast) {
            try {
                const result = options.textToMdast({ text: textValue })
                return Array.isArray(result) ? result : [result]
            } catch (error) {
                // Call onError callback if provided, otherwise log
                if (options.onError) {
                    options.onError(error, textValue)
                } else {
                    console.error('Failed to convert text to mdast:', error)
                    console.error('Text content:', textValue)
                }
                // Fallback to simple text node
                return [
                    {
                        type: 'text',
                        value: textValue,
                    } satisfies MdastText,
                ]
            }
        }

        // Default: return simple text node
        return [
            {
                type: 'text',
                value: textValue,
            } satisfies MdastText,
        ]
    }

    if (!isElementNode(node)) {
        return []
    }

    const convertTagNameFn = options?.convertTagName || defaultConvertTagName
    // Use localName which is always lowercase in both browser and linkedom
    const componentName = convertTagNameFn({ tagName: node.localName })

    // If convertTagName returns empty string, skip this element and only return its children
    if (componentName === '') {
        // Process children but skip the element wrapper
        const children: RootContent[] = []
        for (const child of Array.from(node.childNodes)) {
            children.push(...htmlNodeToMdxAst(child, options))
        }
        return children
    }

    // Convert attributes
    const attributes: MdxJsxAttribute[] = []
    for (const attr of Array.from(node.attributes)) {
        attributes.push(convertAttribute(attr, node.tagName, options))
    }

    // Process children
    const children: RootContent[] = []
    for (const child of Array.from(node.childNodes)) {
        children.push(...htmlNodeToMdxAst(child, options))
    }

    // Always create MdxJsxTextElement initially
    // The conversion to MdxJsxFlowElement will be handled by a separate plugin
    const element: MdxJsxTextElement = {
        type: 'mdxJsxTextElement',
        name: componentName,
        attributes,
        children: children as any,
    }
    return [element]
}

// Main function to parse HTML and return MDX AST - always returns an array
export function htmlToMdxAst(options: ParseHtmlToMdxAstOptions): RootContent[] {
    // Parse HTML with linkedom
    const { document } = parseHTML(options.html.trim())

    // linkedom behavior:
    // - If input is a fragment (like "<div>Hello</div>"), the content becomes direct children of document
    // - If input has body tag, it creates proper body element
    // - We need to handle both cases

    // linkedom behavior:
    // - When parsing fragments, content becomes direct children of document
    // - Accessing document.body on fragments auto-creates HEAD and BODY as children
    // - We must avoid accessing document.body to prevent this

    // Just use document's direct children and filter for relevant nodes
    const childNodes = Array.from(document.childNodes).filter(
        (node) =>
            node.nodeType === 1 || // Element nodes
            node.nodeType === 3 || // Text nodes
            node.nodeType === 8, // Comment nodes
    )

    let results: RootContent[] = []

    for (const node of childNodes) {
        results.push(...htmlNodeToMdxAst(node, options))
    }

    // Apply the normalize plugin if we have a parentType
    if (options.parentType && results.length > 0) {
        // Create a temporary AST node with the same parent type
        const parentType = options.parentType
        const tempRoot: Root = {
            type: 'root',
            children: results,
        }

        // If we have a specific parent type, wrap the content in that parent
        // to provide proper context for the normalize plugin
        let astToProcess: Root
        if (parentType !== 'root') {
            // Create a parent node of the specified type with our content as children
            const parentNode: any = {
                type: parentType,
                children: tempRoot.children,
            }
            astToProcess = {
                type: 'root',
                children: [parentNode],
            }
        } else {
            astToProcess = tempRoot
        }

        // Create a simple processor and run the normalize plugin
        const processor = unified().use(remarkMdxJsxNormalize)
        processor.runSync(astToProcess)

        // Extract the result back
        if (parentType !== 'root') {
            // Get the children from the parent node we created
            const processedParent = astToProcess.children[0] as any
            results = processedParent.children as RootContent[]
        } else {
            // Get children directly from root
            results = astToProcess.children
        }
    }

    return results
}

// Export a wrapper that always returns an array for consistency
// Note: htmlToMdxAst now already returns an array, so this is just an alias
export function parseHtmlToMdxAst(
    options: ParseHtmlToMdxAstOptions,
): RootContent[] {
    return htmlToMdxAst(options)
}
