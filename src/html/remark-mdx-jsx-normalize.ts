import type { Root, Nodes } from 'mdastic'
import { visit } from 'mdastic'

/** Parents that require phrasing/inline children */
const PHRASE_CONTAINERS = new Set([
    'paragraph',
    'heading',
    'emphasis',
    'strong',
    'delete',
    'link',
    'linkReference',
    'tableCell',
    'mdxJsxTextElement', // MDX JSX text elements should contain phrasing
])

/** HTML tags that require phrasing/inline children */
const PHRASE_HTML_CONTAINERS = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'em',
    'strong',
    'b',
    'i',
    'u',
    's',
    'del',
    'ins',
    'mark',
    'small',
    'sub',
    'sup',
    'a',
    'abbr',
    'cite',
    'code',
    'dfn',
    'kbd',
    'q',
    'samp',
    'span',
    'time',
    'var',
])

/** Parents that accept/expect flow (block) content */
const FLOW_CONTAINERS = new Set([
    'root',
    'listItem',
    'blockquote',
    'footnoteDefinition',
    'mdxJsxFlowElement', // MDX JSX flow elements should contain flow
])

/** Check if a node represents phrasing content */
function isPhrasing(node: Nodes): boolean {
    const phrasingTypes = new Set([
        'text',
        'emphasis',
        'strong',
        'delete',
        'html',
        'image',
        'imageReference',
        'inlineCode',
        'link',
        'linkReference',
        'break',
        'mdxJsxTextElement',
    ])
    return phrasingTypes.has(node.type)
}

/** Tags that are typically block-level elements */
const blockLevelTags = new Set([
    'div',
    'p',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'pre',
    'hr',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'section',
    'article',
    'aside',
    'nav',
    'header',
    'footer',
    'main',
    'figure',
    'figcaption',
    // Notion-specific block elements
    'callout',
    'columns',
    'column',
    'page',
    'database',
    'data-source',
    'audio',
    'video',
    'file',
    'pdf',
    'embed',
    'synced_block',
    'synced_block_reference',
    'meeting-notes',
    'summary',
    'notes',
    'transcript',
    'table_of_contents',
    'unknown',
    'image', // Images can be block-level in Notion
])

/**
 * Make mdxJsx* element kinds match their context.
 * - Inside phrasing parents → mdxJsxTextElement
 * - Inside flow parents → mdxJsxFlowElement
 * - Elements with block-level tag names → mdxJsxFlowElement
 * - Elements containing non-phrasing children → mdxJsxFlowElement
 */
export function normalizeMdxJsx(tree: Root): void {
    visit(tree, ['mdxJsxTextElement', 'mdxJsxFlowElement'], (element, index, parent) => {
        if (!parent) return

        let parentExpectsPhrasing = false
        let parentExpectsFlow = false
        if ((parent.type === 'mdxJsxFlowElement' || parent.type === 'mdxJsxTextElement') && parent.name) {
            const tag = parent.name.toLowerCase()
            parentExpectsPhrasing = PHRASE_HTML_CONTAINERS.has(tag)
            parentExpectsFlow = !parentExpectsPhrasing && blockLevelTags.has(tag)
        } else {
            parentExpectsPhrasing = PHRASE_CONTAINERS.has(parent.type)
            parentExpectsFlow = FLOW_CONTAINERS.has(parent.type)
        }

        const hasBlockTag = element.name ? blockLevelTags.has(element.name.toLowerCase()) : false
        const containsNonPhrasing = element.children.some((child) => !isPhrasing(child))
        if (hasBlockTag || containsNonPhrasing) {
            element.type = 'mdxJsxFlowElement'
        } else if (parentExpectsPhrasing) {
            element.type = 'mdxJsxTextElement'
        } else if (parentExpectsFlow) {
            element.type = 'mdxJsxFlowElement'
        }
    })
}

/** Remark-compatible wrapper without a unified dependency. */
export function remarkMdxJsxNormalize() {
    return normalizeMdxJsx
}
