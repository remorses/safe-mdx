// The remark/unified API from before the mdastic parser must keep working.
import type { Root } from 'mdast'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import { expect, test } from 'vitest'
import { remarkHtmlToMdx } from './markdown.ts'
import { MdastToJsx } from './safe-mdx.tsx'
import { createMdxProcessor, mdxParse, mdxProcessor, remarkMarkAndUnravel } from './parse.ts'

const source = '<Note>hi</Note>\n\n<div class="a">x</div>\n'

test('mdxProcessor and mdxParse produce the same tree', () => {
    const legacy = mdxProcessor.processSync(source).data.ast
    expect(JSON.stringify(mdxParse(source))).toEqual(JSON.stringify(legacy))
})

test('createMdxProcessor runs remarkPlugins', () => {
    const processor = createMdxProcessor({
        remarkPlugins: [[() => (tree: any) => { tree.data = { seen: true } }]],
    })
    expect((processor.processSync('# hi').data.ast as any).data).toEqual({ seen: true })
})

test('remarkMarkAndUnravel works as a remark plugin and a plain transformer', () => {
    const processor = remark().use(remarkGfm).use(remarkMarkAndUnravel)
    const tree = processor.runSync(processor.parse('hello'))
    expect(tree.type).toBe('root')
    expect(typeof remarkMarkAndUnravel()).toBe('function')
})

test('remarkHtmlToMdx works with plain remark', () => {
    const processor = remark().use(remarkGfm).use(remarkHtmlToMdx)
    const tree = processor.runSync(processor.parse('<b>hi</b>\n'))
    expect(JSON.stringify(tree)).toContain('mdxJsx')
})

// Checked by `pnpm build`: public APIs keep using mdast types, not mdastic types.
test('public types stay compatible with mdast', () => {
    const tree: Root = mdxParse(source)
    const fromRemark: Root = remark().parse(source)
    expect(new MdastToJsx({ markdown: source, mdast: fromRemark }).run()).toBeDefined()
    expect(tree.type).toBe('root')
})
