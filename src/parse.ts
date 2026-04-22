import remarkFrontmatter from 'remark-frontmatter'
import { collapseWhiteSpace } from 'collapse-white-space'
import { visit } from 'unist-util-visit'
import { Root, RootContent } from 'mdast'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import { parseHtmlToMdxAst, remarkMdxJsxNormalize } from './html/html-to-mdx-ast.ts'

export { parseHtmlToMdxAst, remarkMdxJsxNormalize }

/* ── Import extraction ──────────────────────────────────────────────── */

export type MdxImportSpecifier = {
    /** Name used in MDX (e.g. `Card`, `MyButton`, `Utils`) */
    local: string
    /** Original export name. `'default'` for default imports, local name for named, `'*'` for namespace */
    imported: string
    type: 'named' | 'default' | 'namespace'
}

export type MdxImport = {
    /** Raw source string as written: `'./card'`, `'/snippets/ui'`, `'some-pkg'` */
    source: string
    specifiers: MdxImportSpecifier[]
}

/**
 * Extract all import declarations from a parsed mdast tree.
 * Unlike `parseEsmImports`, this accepts ANY source (not just HTTPS URLs).
 */
export function extractImports(ast: Root): MdxImport[] {
    const imports: MdxImport[] = []

    for (const node of ast.children) {
        if (node.type !== 'mdxjsEsm') continue
        const estree = (node as any).data?.estree
        if (!estree) continue

        for (const statement of estree.body) {
            if (statement.type !== 'ImportDeclaration') continue
            const source = statement.source?.value
            if (typeof source !== 'string') continue

            const specifiers: MdxImportSpecifier[] = []
            for (const spec of statement.specifiers ?? []) {
                if (spec.type === 'ImportDefaultSpecifier') {
                    specifiers.push({ local: spec.local.name, imported: 'default', type: 'default' })
                } else if (spec.type === 'ImportSpecifier') {
                    const importedName = spec.imported.type === 'Identifier'
                        ? spec.imported.name
                        : String(spec.imported.value)
                    specifiers.push({ local: spec.local.name, imported: importedName, type: 'named' })
                } else if (spec.type === 'ImportNamespaceSpecifier') {
                    specifiers.push({ local: spec.local.name, imported: '*', type: 'namespace' })
                }
            }

            if (specifiers.length > 0) {
                imports.push({ source, specifiers })
            }
        }
    }

    return imports
}

export function mdxParse(code: string) {
    const file = mdxProcessor.processSync(code)
    return file.data.ast as Root
}

/**
 * https://github.com/mdx-js/mdx/blob/b3351fadcb6f78833a72757b7135dcfb8ab646fe/packages/mdx/lib/plugin/remark-mark-and-unravel.js
 * A tiny plugin that unravels `<p><h1>x</h1></p>` but also
 * `<p><Component /></p>` (so it has no knowledge of "HTML").
 *
 * It also marks JSX as being explicitly JSX, so when a user passes a `h1`
 * component, it is used for `# heading` but not for `<h1>heading</h1>`.
 *
 */
export function remarkMarkAndUnravel() {
    return function (tree: Root) {
        visit(tree, function (node, index, parent) {
            let offset = -1
            let all = true
            let oneOrMore = false

            if (
                parent &&
                typeof index === 'number' &&
                node.type === 'paragraph'
            ) {
                const children = node.children

                while (++offset < children.length) {
                    const child = children[offset]

                    if (
                        child.type === 'mdxJsxTextElement' ||
                        child.type === 'mdxTextExpression'
                    ) {
                        oneOrMore = true
                    } else if (
                        child.type === 'text' &&
                        collapseWhiteSpace(child.value, {
                            style: 'html',
                            trim: true,
                        }) === ''
                    ) {
                        // Empty.
                    } else {
                        all = false
                        break
                    }
                }

                if (all && oneOrMore) {
                    offset = -1

                    const newChildren: RootContent[] = []

                    while (++offset < children.length) {
                        const child = children[offset]

                        if (child.type === 'mdxJsxTextElement') {
                            // @ts-expect-error: mutate because it is faster; content model is fine.
                            child.type = 'mdxJsxFlowElement'
                        }

                        if (child.type === 'mdxTextExpression') {
                            // @ts-expect-error: mutate because it is faster; content model is fine.
                            child.type = 'mdxFlowExpression'
                        }

                        if (
                            child.type === 'text' &&
                            /^[\t\r\n ]+$/.test(String(child.value))
                        ) {
                            // Empty.
                        } else {
                            newChildren.push(child)
                        }
                    }

                    parent.children.splice(index, 1, ...newChildren)
                    return index
                }
            }
        })
    }
}

/* ── Module resolution ───────────────────────────────────────────────── */

/** Extensions tried when resolving a bare import against glob keys */
const RESOLVE_EXTENSIONS = [
    '', '.tsx', '.ts', '.jsx', '.js', '.mdx', '.md',
    '/index.tsx', '/index.ts', '/index.jsx', '/index.js',
]

/**
 * Given an import source and a baseUrl, resolve the source to a key
 * that exists in `moduleKeys`. Handles:
 * - Relative imports (`./card`) resolved from `baseUrl`
 * - Absolute imports (`/snippets/card`) normalized to `./snippets/card`
 * - Extension resolution (tries .tsx, .ts, .jsx, .js, .mdx, .md, /index.*)
 */
export function resolveModulePath(
    source: string,
    baseUrl: string,
    moduleKeys: string[],
): string | undefined {
    let normalized: string

    if (source.startsWith('/')) {
        // Absolute import from project root: /snippets/card → ./snippets/card
        normalized = '.' + source
    } else if (source.startsWith('./') || source.startsWith('../')) {
        // Relative import: resolve from baseUrl
        const joined = joinPaths(baseUrl, source)
        if (!joined) return undefined // .. escaped above root
        normalized = joined
    } else {
        // Bare specifier (npm package etc.) — not resolvable from glob
        return undefined
    }

    // Try each extension
    for (const ext of RESOLVE_EXTENSIONS) {
        const candidate = normalized + ext
        if (moduleKeys.includes(candidate)) {
            return candidate
        }
    }

    return undefined
}

/** Simple path join that normalizes `./a/b/../c` segments.
 *  Both inputs and output use `./` prefix (matching Vite glob key format).
 *  Returns `undefined` if `..` escapes above the project root. */
function joinPaths(base: string, relative: string): string | undefined {
    // Strip ./ prefix and trailing /
    const baseParts = base.replace(/^\.\//, '').replace(/\/$/, '').split('/').filter(Boolean)
    const relParts = relative.replace(/^\.\//, '').split('/').filter(Boolean)

    for (const part of relParts) {
        if (part === '..') {
            if (baseParts.length === 0) return undefined // escaped above root
            baseParts.pop()
        } else if (part !== '.') {
            baseParts.push(part)
        }
    }

    return './' + baseParts.join('/')
}

export type LazyGlob = Record<string, () => Promise<Record<string, any>>>
export type EagerModules = Record<string, Record<string, any>>

/**
 * Given a lazy Vite glob and a parsed mdast, resolve only the imported
 * modules eagerly. Returns the exact shape `SafeMdxRenderer.modules` expects.
 *
 * Usage:
 * ```ts
 * const lazyGlob = import.meta.glob('./snippets/*.tsx')
 * const mdast = mdxParse(mdxString)
 * const modules = await resolveModules({ glob: lazyGlob, mdast, baseUrl: './pages/' })
 * <SafeMdxRenderer modules={modules} baseUrl="./pages/" ... />
 * ```
 */
export async function resolveModules({
    glob,
    mdast,
    baseUrl,
}: {
    glob: LazyGlob
    mdast: Root
    baseUrl: string
}): Promise<EagerModules> {
    const imports = extractImports(mdast)
    if (imports.length === 0) return {}

    const keys = Object.keys(glob)
    const result: EagerModules = {}

    await Promise.all(
        imports.map(async (imp) => {
            const resolved = resolveModulePath(imp.source, baseUrl, keys)
            if (!resolved || !glob[resolved]) return
            // Avoid loading the same module twice
            if (result[resolved]) return
            result[resolved] = await glob[resolved]()
        }),
    )

    return result
}

const mdxProcessor = remark()
    .use(remarkMdx)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkGfm)
    .use(remarkMarkAndUnravel)
    .use(() => {
        return (tree, file) => {
            file.data.ast = tree
        }
    })
