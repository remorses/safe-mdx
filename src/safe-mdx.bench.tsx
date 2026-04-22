import { bench, describe } from 'vitest'
import { mdxParse } from './parse.ts'
import { MdastToJsx } from './safe-mdx.tsx'

let longMdxContent = await fetch(
    'https://raw.githubusercontent.com/colinhacks/zod/0a49fa39348b7c72b19ddedc3b0f879bd395304b/packages/docs/content/packages/v3.mdx',
).then((x) => x.text())

function Callout({ children }: { children: any }) {
    return (
        <div
            style={{
                borderLeft: '4px solid #0070f3',
                background: '#f0f8ff',
                padding: '8px 16px',
                margin: '16px 0',
            }}
        >
            {children}
        </div>
    )
}

const mdast = mdxParse(longMdxContent)

describe('safe-mdx performance benchmarks', () => {
    bench('MdastToJsx class processing (long MDX)', () => {
        const visitor = new MdastToJsx({
            markdown: longMdxContent,
            mdast,
            components: { Callout },
        })
        visitor.run()
        const errors = visitor.errors
        // export interface SafeMdxError {
        //     message: string
        //     line?: number
        //     schemaPath?: string
        // }
    })

    bench('MdastToJsx with noop createElement (long MDX)', () => {
        const noopCreateElement = () => null
        const visitor = new MdastToJsx({
            markdown: longMdxContent,
            mdast,
            components: { Callout },
            createElement: noopCreateElement,
        })
        visitor.run()
    })
})
