// Segment-cached markdown parsing for streaming MDX input. It reuses stable mdast nodes and reparses only the live tail.
import type { Root, RootContent } from 'mdast'

import { createMdxProcessor, mdxParse, type MdxProcessor } from './parse.ts'

export { createMdxProcessor }

export interface SegmentEntry {
    len: number
    hash: number
    end: number
    nodes: RootContent[]
}

export type SegmentCache = Map<number, SegmentEntry>

export interface IncrementalParseError {
    message: string
    line?: number
    column?: number
    offset?: number
    cause: ParseErrorCause
}

type ParseErrorCause = string | {
    message?: string
    place?: {
        line?: number
        column?: number
        offset?: number
    }
}

type MutableAstNode = {
    position?: {
        start?: Point
        end?: Point
    }
    children?: MutableAstNode[]
}

type Point = {
    line?: number
    column?: number
    offset?: number
}

export interface IncrementalParseOptions {
    markdown: string
    cache: SegmentCache
    /** Number of unstable top-level nodes to keep out of the cache. Defaults to 2. */
    trailingNodes?: number
    /** Custom unified processor. Use `createMdxProcessor({ remarkPlugins })` for plugin customization. */
    processor?: MdxProcessor
    /** Fully custom parse hook. Takes precedence over `processor`. */
    parse?: (markdown: string) => Root
}

export interface IncrementalParseResult {
    mdast: Root
    errors: IncrementalParseError[]
}

export function parseMarkdownIncremental({
    markdown,
    cache,
    trailingNodes = 2,
    processor,
    parse,
}: IncrementalParseOptions): IncrementalParseResult {
    const children: RootContent[] = []
    const errors: IncrementalParseError[] = []
    const parseSlice = parse ?? ((code: string) => parseWithProcessor(code, processor))

    for (let offset = 0; offset < markdown.length;) {
        const entry = cache.get(offset)
        if (entry) {
            const slice = markdown.slice(offset, entry.end)
            if (slice.length === entry.len && quickHash(slice) === entry.hash) {
                children.push(...entry.nodes)
                offset = entry.end
                continue
            }
        }

        const rest = markdown.slice(offset)
        if (!rest) break
        const basePoint = pointAtOffset(markdown, offset)

        try {
            const ast = parseSlice(rest)
            children.push(...ast.children.map((node) => adjustNodePositions(node, basePoint)))
        } catch (cause) {
            errors.push(parseErrorFromCause(cause, basePoint))
        }
        break
    }

    const stableChildren = trailingNodes > 0 ? children.slice(0, -trailingNodes) : children
    let segmentStart = 0
    for (const node of stableChildren) {
        const end = node.position?.end.offset
        if (typeof end !== 'number' || end < segmentStart) continue

        const slice = markdown.slice(segmentStart, end)
        cache.set(segmentStart, {
            len: slice.length,
            hash: quickHash(slice),
            end,
            nodes: [node],
        })
        segmentStart = end
    }

    trimCache(cache)

    return {
        mdast: {
            type: 'root',
            children,
            position: {
                start: { line: 1, column: 1, offset: 0 },
                end: pointAtOffset(markdown, markdown.length),
            },
        },
        errors,
    }
}

function parseWithProcessor(markdown: string, processor?: MdxProcessor): Root {
    if (!processor) return mdxParse(markdown)

    const file = processor.processSync(markdown)
    const ast = file.data.ast
    const isRoot = (value: any): value is Root => {
        return value?.type === 'root' && Array.isArray(value?.children)
    }
    if (!isRoot(ast)) {
        throw new Error('Processor did not expose mdast at file.data.ast')
    }
    return ast
}

function quickHash(s: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = (h * 0x01000193) >>> 0
    }
    return h
}

function pointAtOffset(text: string, offset: number) {
    let line = 1
    let column = 1

    for (let i = 0; i < offset; i++) {
        if (text[i] === '\n') {
            line++
            column = 1
        } else {
            column++
        }
    }

    return { line, column, offset }
}

function adjustNodePositions<T extends MutableAstNode>(node: T, basePoint: { line: number, column: number, offset: number }): T {
    const position = node.position
    if (position) {
        adjustPoint(position.start, basePoint)
        adjustPoint(position.end, basePoint)
    }

    if (Array.isArray(node.children)) {
        node.children = node.children.map((child) => adjustNodePositions(child, basePoint))
    }

    return node
}

function adjustPoint(point: Point | undefined, basePoint: { line: number, column: number, offset: number }) {
    if (!point) return

    if (typeof point.offset === 'number') {
        point.offset += basePoint.offset
    }
    if (typeof point.line === 'number') {
        point.line += basePoint.line - 1
    }
    if (typeof point.column === 'number' && point.line === basePoint.line) {
        point.column += basePoint.column - 1
    }
}

function parseErrorFromCause(cause: ParseErrorCause, basePoint: { line: number, column: number, offset: number }): IncrementalParseError {
    const place = typeof cause === 'string' ? undefined : cause.place
    const point = place ? { ...place } : undefined
    if (point) adjustPoint(point, basePoint)

    return {
        message: typeof cause === 'string' ? cause : cause.message ?? String(cause),
        line: point?.line,
        column: point?.column,
        offset: point?.offset,
        cause,
    }
}

function trimCache(cache: SegmentCache) {
    const maxCacheSize = 300
    if (cache.size <= maxCacheSize) return

    const keys = Array.from(cache.keys()).sort((a, b) => a - b)
    for (const key of keys.slice(0, cache.size - maxCacheSize)) {
        cache.delete(key)
    }
}
