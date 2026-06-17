import React, { cloneElement } from 'react'

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { JSXElement, JSXFragment } from 'estree-jsx'
import Evaluate from 'eval-estree-expression'
import type { Node, Parent, Root, RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'

import { Fragment, ReactNode } from 'react'
import { DynamicEsmComponent } from 'safe-mdx/client'
import { extractComponentInfo, parseEsmImports } from './esm-parser.ts'
import { resolveModulePath, type EagerModules } from './parse.ts'
import { nativeTags } from './html/valid-html-elements.ts'

export type MyRootContent = RootContent | Root

declare module 'mdast' {
    export interface HProperties {
        id?: string
    }
    export interface Data {
        hProperties?: HProperties
    }
}

export type RenderNode = (
    node: MyRootContent,
    transform: (node: MyRootContent) => ReactNode,
) => ReactNode | undefined

export type SafeMdxErrorType = 'validation' | 'missing-component' | 'expression' | 'esm-import'

export interface SafeMdxError {
    type: SafeMdxErrorType
    message: string
    line?: number
    schemaPath?: string
}

export type ComponentPropsSchema = Record<string, StandardSchemaV1>

export type CreateElementFunction = (
    type: any,
    props?: any,
    ...children: ReactNode[]
) => ReactNode

export interface EvaluateOptions {
    /** Enable function calls in expressions. Automatically enabled when `scope` is provided. */
    functions?: boolean
    /** Pass `escodegen.generate` to support inline function expressions
     *  like arrow functions in `.map(x => x.name)`. Requires `functions: true`. */
    generate?: (ast: any) => string
    /** Force logical operators (`&&`, `||`) to return booleans. */
    booleanLogicalOperators?: boolean
    /** Throw when variables referenced in expressions are undefined. */
    strict?: boolean
}

export const SafeMdxRenderer = React.memo(function SafeMdxRenderer({
    components,
    markdown = '',
    mdast = null as any,
    renderNode,
    componentPropsSchema,
    createElement,
    allowClientEsmImports = false,
    addMarkdownLineNumbers = false,
    modules,
    baseUrl,
    onError,
    scope,
    evaluateOptions,
}: {
    components?: ComponentsMap
    markdown?: string
    mdast?: MyRootContent
    renderNode?: RenderNode
    componentPropsSchema?: ComponentPropsSchema
    createElement?: CreateElementFunction
    allowClientEsmImports?: boolean
    addMarkdownLineNumbers?: boolean
    /** Pre-resolved modules keyed by file path (e.g. from `import.meta.glob`).
     *  When MDX contains `import { Card } from './card'`, the import source is
     *  resolved against these keys using `baseUrl` for relative paths. */
    modules?: EagerModules
    /** Directory of the current MDX file, used to resolve relative import
     *  sources against `modules` keys. E.g. `'./pages/getting-started/'` */
    baseUrl?: string
    /** Called for each error during rendering (missing components, invalid props, failed expressions).
     *  Throw inside this callback to stop rendering on first error. */
    onError?: (error: SafeMdxError) => void
    /** Variables and functions available in MDX expressions.
     *  When scope contains functions, function calls in expressions are
     *  automatically enabled. */
    scope?: Record<string, any>
    /** Options passed to `eval-estree-expression` for expression evaluation.
     *  Pass `{ functions: true }` to enable function calls, or
     *  `{ functions: true, generate: escodegen.generate }` to also support
     *  inline arrow functions and callbacks like `.map(x => x.name)`. */
    evaluateOptions?: EvaluateOptions
}) {
    const visitor = new MdastToJsx({
        markdown,
        mdast,
        components,
        renderNode,
        componentPropsSchema,
        createElement,
        allowClientEsmImports,
        addMarkdownLineNumbers,
        modules,
        baseUrl,
        onError,
        scope,
        evaluateOptions,
    })
    const result = visitor.run()
    return result
})

export class MdastToJsx {
    mdast: MyRootContent
    str: string
    jsxStr: string = ''
    c: ComponentsMap
    errors: SafeMdxError[] = []
    renderNode?: RenderNode
    componentPropsSchema?: ComponentPropsSchema
    createElement: CreateElementFunction
    esmImports: Map<string, string> = new Map()
    allowClientEsmImports: boolean
    addMarkdownLineNumbers: boolean
    modules?: EagerModules
    baseUrl?: string
    onError?: (error: SafeMdxError) => void
    scope?: Record<string, any>
    /** Whether the caller passed a non-empty scope. Used to decide if
     *  function calls should be auto-enabled — module imports adding to
     *  scope should NOT flip this flag. */
    private userProvidedScope: boolean = false
    evaluateOptions?: EvaluateOptions

    constructor({
        markdown: code = '',
        mdast,
        components = {} as ComponentsMap,
        renderNode,
        componentPropsSchema,
        createElement = React.createElement,
        allowClientEsmImports = false,
        addMarkdownLineNumbers = false,
        modules,
        baseUrl,
        onError,
        scope,
        evaluateOptions,
    }: {
        markdown?: string
        mdast: MyRootContent
        components?: ComponentsMap
        renderNode?: (
            node: MyRootContent,
            transform: (node: MyRootContent) => ReactNode,
        ) => ReactNode | undefined
        componentPropsSchema?: ComponentPropsSchema
        createElement?: CreateElementFunction
        allowClientEsmImports?: boolean
        addMarkdownLineNumbers?: boolean
        modules?: EagerModules
        baseUrl?: string
        /** Called for each error during rendering (missing components, invalid props, failed expressions).
         *  Throw inside this callback to stop rendering on first error. */
        onError?: (error: SafeMdxError) => void
        /** Variables and functions available in MDX expressions.
         *  When scope contains functions, function calls in expressions are
         *  automatically enabled. */
        scope?: Record<string, any>
        /** Options passed to `eval-estree-expression` for expression evaluation.
         *  Pass `{ functions: true }` to enable function calls, or
         *  `{ functions: true, generate: escodegen.generate }` to also support
         *  inline arrow functions and callbacks like `.map(x => x.name)`. */
        evaluateOptions?: EvaluateOptions
    }) {
        this.str = code

        this.mdast = mdast

        this.renderNode = renderNode

        this.componentPropsSchema = componentPropsSchema

        this.createElement = createElement

        this.allowClientEsmImports = allowClientEsmImports

        this.addMarkdownLineNumbers = addMarkdownLineNumbers

        this.modules = modules
        this.baseUrl = baseUrl
        this.onError = onError
        this.scope = scope ? { ...scope } : undefined
        this.userProvidedScope = !!scope && Object.keys(scope).length > 0
        this.evaluateOptions = evaluateOptions

        this.c = {
            ...Object.fromEntries(
                nativeTags.map((tag) => {
                    return [tag, tag]
                }),
            ),
            ...components,
        }

    }

    pushError(error: SafeMdxError): void {
        this.errors.push(error)
        this.onError?.(error)
    }

    /**
     * Resolve import declarations from an mdxjsEsm node against `this.modules`.
     * Resolved components are added directly to `this.c` (the component map)
     * so the existing `accessWithDot` lookup finds them.
     */
    /** Resolve imports from pre-loaded modules. Returns the set of local names that were resolved. */
    resolveImportsFromModules(node: MyRootContent): Set<string> {
        const resolved = new Set<string>()
        const estree = (node as any).data?.estree
        if (!estree) return resolved

        const moduleKeys = Object.keys(this.modules!)

        for (const statement of estree.body) {
            if (statement.type !== 'ImportDeclaration') continue
            const source: string = statement.source?.value
            if (typeof source !== 'string') continue

            const resolvedPath = resolveModulePath(source, this.baseUrl || './', moduleKeys)
            if (!resolvedPath) continue
            const mod = this.modules![resolvedPath]
            if (mod == null) continue

            for (const spec of statement.specifiers ?? []) {
                let value: any
                if (spec.type === 'ImportDefaultSpecifier') {
                    value = mod.default ?? mod
                } else if (spec.type === 'ImportSpecifier') {
                    const importedName = spec.imported.type === 'Identifier'
                        ? spec.imported.name
                        : String(spec.imported.value)
                    value = mod[importedName]
                } else if (spec.type === 'ImportNamespaceSpecifier') {
                    // Namespace import: import * as UI from '...'
                    // Supports <UI.Card> via accessWithDot
                    value = mod
                } else {
                    continue
                }

                this.c[spec.local.name] = value
                resolved.add(spec.local.name)
                // Also add to scope so values are available in expressions
                // like {code} or prop={code}
                if (!this.scope) this.scope = {}
                this.scope[spec.local.name] = value
            }
        }
        return resolved
    }

    addLineNumberToProps(
        props: Record<string, any> | undefined,
        node: MyRootContent,
    ): Record<string, any> {
        if (!this.addMarkdownLineNumbers) {
            return props || {}
        }

        const lineNumber = node.position?.start?.line
        if (lineNumber) {
            return {
                ...props,
                'data-markdown-line': lineNumber,
            }
        }
        return props || {}
    }

    validateComponentProps(
        componentName: string,
        props: Record<string, any>,
        line?: number,
    ): void {
        if (
            !this.componentPropsSchema ||
            !this.componentPropsSchema[componentName]
        ) {
            return
        }

        const schema = this.componentPropsSchema[componentName]
        let result = schema['~standard'].validate(props)

        if (result instanceof Promise) {
            // Ignore async validation errors as requested
            return
        } else {
            if (result.issues) {
                result.issues.forEach((issue) => {
                    const propPath = issue.path?.join('.') || 'unknown'
                    this.pushError({
                        type: 'validation',
                        message: `Invalid props for component "${componentName}" at "${propPath}": ${issue.message}`,
                        line,
                        schemaPath: issue.path?.join('.'),
                    })
                })
            }
        }
    }

    mapMdastChildren(node: any) {
        const res = node.children
            ?.flatMap((child) => this.mdastTransformer(child, node.type))
            .filter(Boolean)
        if (Array.isArray(res)) {
            if (!res.length) {
                return null
            } else if (res.length === 1) {
                return res[0]
            } else {
                return res.map((x, i) =>
                    React.isValidElement(x) ? cloneElement(x, { key: i }) : x,
                )
            }
        }
        return res || null
    }
    mapJsxChildren(node: any) {
        const res = node.children
            ?.flatMap((child, i) => this.jsxTransformer(child))
            .filter(Boolean)
        if (Array.isArray(res)) {
            if (!res.length) {
                return null
            } else if (res.length === 1) {
                return res[0]
            } else {
                return res.map((x, i) =>
                    React.isValidElement(x) ? cloneElement(x, { key: i }) : x,
                )
            }
        }
        return res || null
    }
    jsxTransformer(node: MyRootContent): ReactNode {
        if (!node) {
            return []
        }

        switch (node.type) {
            case 'mdxJsxTextElement':
            case 'mdxJsxFlowElement': {
                if (!node.name) {
                    // JSX fragment (<>...</>) — name is null in mdast
                    return this.createElement(
                        Fragment,
                        null,
                        this.mapJsxChildren(node),
                    )
                }

                // Check if this is an ESM imported component (only if allowed)
                const esmImportInfo = this.allowClientEsmImports
                    ? this.esmImports.get(node.name)
                    : null
                let Component

                if (esmImportInfo) {
                    // Handle ESM imported component
                    const { importUrl, componentName } =
                        extractComponentInfo(esmImportInfo)
                    Component = DynamicEsmComponent
                    let attrsList = this.getJsxAttrs(node, (err) => {
                        this.pushError(err)
                    })
                    let attrs = Object.fromEntries(attrsList)

                    return this.createElement(
                        Component,
                        this.addLineNumberToProps(
                            { ...attrs, importUrl, componentName },
                            node,
                        ),
                        this.mapJsxChildren(node),
                    )
                } else {
                    Component = accessWithDot(this.c, node.name)

                    if (!Component) {
                        this.pushError({
                            type: 'missing-component',
                            message: `Unsupported jsx component ${node.name}`,
                            line: node.position?.start?.line,
                        })
                        return null
                    }
                }

                let attrsList = this.getJsxAttrs(node, (err) => {
                    this.pushError(err)
                })

                let attrs = Object.fromEntries(attrsList)

                // Validate component props with schema if available
                this.validateComponentProps(
                    node.name,
                    attrs,
                    node.position?.start?.line,
                )

                return this.createElement(
                    Component,
                    this.addLineNumberToProps(attrs, node),
                    this.mapJsxChildren(node),
                )
            }
            default: {
                return this.mdastTransformer(node, 'mdxJsxFlowElement')
            }
        }
    }

    /** Transform a JSX element or fragment AST node into a React element.
     *  Handles both JSXElement and JSXFragment nodes. */
    transformJsxElement(
        jsxElement: JSXElement | JSXFragment,
        onError?: (err: SafeMdxError) => void,
        line?: number,
    ): ReactNode {
        try {
            // Handle JSX fragments (<>...</>)
            if ((jsxElement as any).type === 'JSXFragment') {
                const children: ReactNode[] = []
                if (jsxElement.children) {
                    for (const child of jsxElement.children) {
                        const transformed = this.transformJsxChild(child, onError, line)
                        if (transformed != null) {
                            children.push(transformed)
                        }
                    }
                }
                return this.createElement(Fragment, null, ...children)
            }

            // After the fragment check, we know this is a JSXElement
            const element = jsxElement as JSXElement

            // Handle JSX opening element
            if (element.openingElement) {
                const tagName = getJsxElementName(element.openingElement.name)
                if (!tagName) {
                    onError?.({
                        type: 'expression',
                        message: 'JSX element missing component name',
                        line: line,
                    })
                    return null
                }

                // Check if this is an ESM imported component (only if allowed)
                const esmImportInfo = this.allowClientEsmImports
                    ? this.esmImports.get(tagName)
                    : null
                let Component

                if (esmImportInfo) {
                    // Handle ESM imported component
                    const { importUrl, componentName } =
                        extractComponentInfo(esmImportInfo)
                    Component = DynamicEsmComponent
                } else {
                    // Get the component from the regular component map
                    // accessWithDot handles dotted names like UI.Card
                    Component = accessWithDot(this.c, tagName)
                    if (!Component) {
                        onError?.({
                            type: 'missing-component',
                            message: `Unsupported jsx component ${tagName} in attribute`,
                            line: line,
                        })
                        return null
                    }
                }

                // Extract attributes
                const props: Record<string, any> = {}
                if (element.openingElement.attributes) {
                    for (const attr of element.openingElement.attributes) {
                        // Handle spread attributes like {...{ className: 'x' }}
                        if (attr.type === 'JSXSpreadAttribute') {
                            try {
                                const result = this.evaluateExpression(attr.argument)
                                if (result && typeof result === 'object') {
                                    Object.assign(props, result)
                                }
                            } catch (error) {
                                onError?.({
                                    type: 'expression',
                                    message: `Failed to evaluate spread attribute in JSX element: ${
                                        error instanceof Error
                                            ? error.message
                                            : String(error)
                                    }`,
                                    line,
                                })
                            }
                            continue
                        }
                        if (
                            attr.type === 'JSXAttribute' &&
                            attr.name?.type === 'JSXIdentifier' &&
                            attr.name.name
                        ) {
                            if (attr.value) {
                                if (attr.value.type === 'Literal') {
                                    props[attr.name.name] = attr.value.value
                                } else if (
                                    attr.value.type === 'JSXExpressionContainer'
                                ) {
                                    const expression = attr.value.expression
                                    if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
                                        // Nested JSX element or fragment in attribute
                                        const nested = this.transformJsxElement(
                                            expression as any,
                                            onError,
                                            line,
                                        )
                                        if (nested) {
                                            props[attr.name.name] = nested
                                        }
                                    } else if (expression.type === 'JSXEmptyExpression') {
                                        // JSX comment like {/* comment */}, skip
                                    } else {
                                        // Evaluate any expression (objects, arrays, literals, etc.)
                                        try {
                                            props[attr.name.name] =
                                                this.evaluateExpression(expression)
                                        } catch (error) {
                                            onError?.({
                                                type: 'expression',
                                                message: `Failed to evaluate attribute "${attr.name.name}" in JSX element: ${
                                                    error instanceof Error
                                                        ? error.message
                                                        : String(error)
                                                }`,
                                                line,
                                            })
                                        }
                                    }
                                }
                            } else {
                                props[attr.name.name] = true
                            }
                        }
                    }
                }

                // Extract children
                const children: ReactNode[] = []
                if (element.children) {
                    for (const child of element.children) {
                        const transformed = this.transformJsxChild(child, onError, line)
                        if (transformed != null) {
                            children.push(transformed)
                        }
                    }
                }

                // Validate component props with schema if available
                this.validateComponentProps(
                    tagName,
                    props,
                    line,
                )

                // Handle ESM imported components by adding required props
                if (esmImportInfo) {
                    const { importUrl, componentName } =
                        extractComponentInfo(esmImportInfo)
                    return this.createElement(
                        Component,
                        { ...props, importUrl, componentName },
                        ...children,
                    )
                } else {
                    return this.createElement(Component, props, ...children)
                }
            }
        } catch (error) {
            // Return null if transformation fails
            onError?.({
                type: 'expression',
                message: `Failed to transform JSX element: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
                line: line,
            })
            return null
        }
        return null
    }

    /** Transform a single JSX child node (text, element, fragment, expression) into a ReactNode. */
    private transformJsxChild(
        child: any,
        onError?: (err: SafeMdxError) => void,
        line?: number,
    ): ReactNode {
        if (child.type === 'JSXText') {
            return child.value
        }
        if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
            return this.transformJsxElement(child, onError, line)
        }
        if (child.type === 'JSXExpressionContainer') {
            const expression = child.expression
            if (!expression || expression.type === 'JSXEmptyExpression') {
                // JSX comment like {/* comment */}, skip
                return null
            }
            if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
                return this.transformJsxElement(expression, onError, line)
            }
            try {
                const result = this.evaluateExpression(expression)
                return result != null ? result : null
            } catch (error) {
                onError?.({
                    type: 'expression',
                    message: `Failed to evaluate expression child in JSX element: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                    line,
                })
                return null
            }
        }
        return null
    }

    evaluateExpression(expression: any) {
        const hasScope = this.scope && Object.keys(this.scope).length > 0
        const context = hasScope ? this.scope : undefined
        const options = this.userProvidedScope || this.evaluateOptions
            ? { ...(this.userProvidedScope ? { functions: true } : {}), ...this.evaluateOptions }
            : undefined

        // When functions are enabled and the user hasn't provided their own
        // `generate` (escodegen), inject our safe AST-interpreting visitors
        // that handle ArrowFunctionExpression and FunctionExpression without
        // using `new Function()` or `eval()`. This makes arrow function
        // callbacks like `.map(x => x.name)` work in Cloudflare Workers.
        if (options && options.functions && !options.generate) {
            ;(options as any).visitors = {
                ...(options as any).visitors,
                ...createSafeFunctionVisitors(),
            }
        }

        // When scope is provided, check that referenced identifiers exist
        // before evaluation. eval-estree-expression silently returns undefined
        // for missing identifiers, so we catch them here to produce clear errors.
        if (context) {
            const missing = findMissingIdentifiers(expression, context)
            if (missing.length > 0) {
                throw new Error(`${missing[0]} is not defined. Available variables: ${Object.keys(context).join(', ')}`)
            }
        }

        return Evaluate.evaluate.sync(expression, context, options)
    }

    getJsxAttrs(
        node: MdxJsxFlowElement | MdxJsxTextElement,
        onError: (err: SafeMdxError) => void = console.error,
    ) {
        let attrsList: [string, any][] = []

        for (const attr of node.attributes) {
            if (attr.type === 'mdxJsxExpressionAttribute') {
                // Handle spread expressions like {...{key: '1'}}
                if (attr.data?.estree) {
                    try {
                        const program = attr.data.estree
                        const firstBody = program.body?.[0]
                        if (
                            firstBody &&
                            firstBody.type === 'ExpressionStatement'
                        ) {
                            const expression = firstBody.expression
                            try {
                                const result =
                                    this.evaluateExpression(expression)

                                // Handle spread syntax - merge the evaluated object
                                if (
                                    typeof result === 'object' &&
                                    result != null
                                ) {
                                    const entries = Object.entries(result)
                                    attrsList.push(...entries)
                                }
                            } catch (error) {
                                onError({
                                    type: 'expression',
                                    message: `Failed to evaluate expression attribute: ${attr.value
                                        .replace(/\n+/g, ' ')
                                        .replace(/ +/g, ' ')}. ${
                                        error instanceof Error
                                            ? error.message
                                            : String(error)
                                    }`,
                                    line: attr.position?.start?.line,
                                })
                            }
                        }
                    } catch (error) {
                        onError({
                            type: 'expression',
                            message: `Failed to evaluate expression attribute: ${attr.value
                                .replace(/\n+/g, ' ')
                                .replace(/ +/g, ' ')}. ${
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            }`,
                            line: attr.position?.start?.line,
                        })
                    }
                } else {
                    onError({
                        type: 'expression',
                        message: `Expressions in jsx props are not supported (${attr.value
                            .replace(/\n+/g, ' ')
                            .replace(/ +/g, ' ')})`,
                        line: attr.position?.start?.line,
                    })
                }
                continue
            }

            if (attr.type !== 'mdxJsxAttribute') {
                onError({
                    type: 'expression',
                    message: `non mdxJsxAttribute attribute is not supported: ${attr}`,
                    line: node.position?.start?.line,
                })
                continue
            }

            const v = attr.value
            if (typeof v === 'string' || typeof v === 'number') {
                attrsList.push([attr.name, v])
                continue
            }
            if (v === null) {
                attrsList.push([attr.name, true])
                continue
            }
            if (v?.type === 'mdxJsxAttributeValueExpression') {
                // Manual parsing fallback for simple values
                if (v.value === 'true') {
                    attrsList.push([attr.name, true])
                    continue
                }
                if (v.value === 'false') {
                    attrsList.push([attr.name, false])
                    continue
                }
                if (v.value === 'null') {
                    attrsList.push([attr.name, null])
                    continue
                }
                if (v.value === 'undefined') {
                    attrsList.push([attr.name, undefined])
                    continue
                }

                if (v.data?.estree) {
                    try {
                        // Extract the expression from the Program body
                        const program = v.data.estree
                        const firstBody = program.body?.[0]
                        if (
                            firstBody &&
                            firstBody.type === 'ExpressionStatement'
                        ) {
                            const expression = firstBody.expression

                            // Check if this is a JSX element or fragment
                            if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
                                // Transform JSX element/fragment to React element
                                const jsxElement = this.transformJsxElement(
                                    expression,
                                    onError,
                                    attr.position?.start?.line,
                                )
                                if (jsxElement) {
                                    attrsList.push([attr.name, jsxElement])
                                    continue
                                }
                            }

                            try {
                                // Evaluate the expression synchronously
                                const result =
                                    this.evaluateExpression(expression)
                                attrsList.push([attr.name, result])
                                continue
                            } catch (error) {
                                onError({
                                    type: 'expression',
                                    message: `Failed to evaluate expression attribute: ${
                                        attr.name
                                    }={${v.value}}. ${
                                        error instanceof Error
                                            ? error.message
                                            : String(error)
                                    }`,
                                    line: attr.position?.start?.line,
                                })
                            }
                        }
                    } catch (error) {
                        // Fall back to the original manual parsing for backwards compatibility
                    }
                }

                onError({
                    type: 'expression',
                    message: `Expressions in jsx prop not evaluated: (${attr.name}={${v.value}})`,
                    line: attr.position?.start?.line,
                })
            }
        }
        return attrsList
    }

    run() {
        const res = this.mdastTransformer(this.mdast, 'root')
        if (Array.isArray(res) && res.length === 1) {
            return res[0]
        }
        return res
    }

    mdastTransformer(node: MyRootContent, parentType: string): ReactNode {
        if (!node) {
            return []
        }

        // Check for custom transformer first, giving it higher priority
        if (this.renderNode) {
            const customResult = this.renderNode(
                node,
                (n) => this.mdastTransformer(n, node.type),
            )
            if (customResult !== undefined) {
                return customResult
            }
        }

        switch (node.type) {
            case 'mdxjsEsm': {
                const estree = (node as any).data?.estree
                const nodeLine = node.position?.start?.line

                // Warn about export declarations (not supported in safe-mdx)
                if (estree) {
                    for (const stmt of estree.body) {
                        if (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') {
                            const stmtLine = stmt.loc?.start?.line ?? nodeLine
                            const exportKind = stmt.type === 'ExportDefaultDeclaration' ? 'default' : 'named'
                            let detail = ''
                            if (stmt.declaration) {
                                const decl = stmt.declaration
                                if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
                                    detail = ` "${decl.id.name}"`
                                } else if (decl.type === 'VariableDeclaration') {
                                    const names = decl.declarations
                                        .map((d: any) => d.id?.name)
                                        .filter(Boolean)
                                        .join(', ')
                                    if (names) detail = ` "${names}"`
                                }
                            }
                            this.pushError({
                                type: 'expression',
                                message: `Unsupported ${exportKind} export${detail}. Export declarations are not evaluated, so exported values and components are not available in the document.`,
                                line: stmtLine,
                            })
                        }
                    }
                }

                // Resolve imports from pre-loaded modules (server-side)
                let resolvedImportLocals = new Set<string>()
                if (this.modules) {
                    resolvedImportLocals = this.resolveImportsFromModules(node)
                }

                // Warn about import declarations that cannot be resolved
                if (estree && !this.allowClientEsmImports) {
                    for (const stmt of estree.body) {
                        if (stmt.type !== 'ImportDeclaration') continue
                        const stmtLine = stmt.loc?.start?.line ?? nodeLine
                        const source: string = stmt.source?.value
                        if (typeof source !== 'string') continue

                        // Check against actually resolved imports, not this.c (which includes pre-existing components)
                        const specNames = (stmt.specifiers ?? []).map((s: any) => s.local?.name).filter(Boolean)
                        const unresolvedNames = specNames.filter((name: string) => !resolvedImportLocals.has(name))

                        if (unresolvedNames.length > 0) {
                            this.pushError({
                                type: 'expression',
                                message: `Unresolved import "${unresolvedNames.join(', ')}" from "${source}". The imported module could not be resolved, so these names are not available in the document.`,
                                line: stmtLine,
                            })
                        }
                    }
                }

                // Parse ESM imports for client-side dynamic loading (only if allowed)
                if (this.allowClientEsmImports) {
                    const parsedImports = parseEsmImports(node, (err) =>
                        this.pushError(err),
                    )
                    parsedImports.forEach((value, key) => {
                        this.esmImports.set(key, value)
                    })
                }
                return []
            }
            case 'mdxJsxTextElement':
            case 'mdxJsxFlowElement': {
                const start = node.position?.start?.offset
                const end = node.position?.end?.offset
                const text = this.str.slice(start, end)
                try {
                    this.jsxStr = text
                    const result = this.jsxTransformer(node)
                    if (Array.isArray(result)) {
                        console.log(`Unexpected array result`)
                    } else if (result) {
                        return result
                    }
                } finally {
                    this.jsxStr = ''
                }
                return []
            }

            case 'mdxFlowExpression':
            case 'mdxTextExpression': {
                if (!node.value) {
                    return []
                }

                // Check if we have an estree AST
                if (node.data?.estree) {
                    try {
                        // Extract the expression from the Program body
                        const program = node.data.estree
                        const firstBody = program.body?.[0]
                        if (
                            firstBody &&
                            firstBody.type === 'ExpressionStatement'
                        ) {
                            const expression = firstBody.expression
                            try {
                                // Evaluate the expression synchronously
                                const result =
                                    this.evaluateExpression(expression)
                                return result
                            } catch (error) {
                                this.pushError({
                                    type: 'expression',
                                    message: `Failed to evaluate expression: ${
                                        node.value
                                    }. ${
                                        error instanceof Error
                                            ? error.message
                                            : String(error)
                                    }`,
                                    line: node.position?.start?.line,
                                })
                            }
                        }
                    } catch (error) {
                        this.pushError({
                            type: 'expression',
                            message: `Failed to evaluate expression: ${
                                node.value
                            }. ${
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            }`,
                            line: node.position?.start?.line,
                        })
                    }
                }

                return []
            }
            case 'yaml': {
                if (!node.value) {
                    return []
                }
                return []
            }
            case 'heading': {
                const level = node.depth
                const Tag = this.c[`h${level}`] ?? `h${level}`

                return this.createElement(
                    Tag,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'paragraph': {
                return this.createElement(
                    this.c.p,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'blockquote': {
                return this.createElement(
                    this.c.blockquote,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'thematicBreak': {
                return this.createElement(
                    this.c.hr,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                )
            }
            case 'code': {
                if (!node.value) {
                    return []
                }
                const language = node.lang || ''
                const code = node.value
                const codeBlock = (className?: string) =>
                    this.createElement(
                        this.c.pre,
                        this.addLineNumberToProps(node.data?.hProperties, node),
                        this.createElement(this.c.code, { className }, code),
                    )

                if (language) {
                    return codeBlock(`language-${language}`)
                }
                return codeBlock()
            }

            case 'list': {
                if (node.ordered) {
                    return this.createElement(
                        this.c.ol,
                        this.addLineNumberToProps(
                            { start: node.start!, ...node.data?.hProperties },
                            node,
                        ),
                        this.mapMdastChildren(node),
                    )
                }
                return this.createElement(
                    this.c.ul,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'listItem': {
                // https://github.com/syntax-tree/mdast-util-gfm-task-list-item#syntax-tree
                if (node?.checked != null) {
                    return this.createElement(
                        this.c.li,
                        this.addLineNumberToProps(
                            {
                                'data-checked': node.checked,
                                ...node.data?.hProperties,
                            },
                            node,
                        ),
                        this.mapMdastChildren(node),
                    )
                }
                return this.createElement(
                    this.c.li,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'text': {
                if (!node.value) {
                    return []
                }
                if (node.data?.hProperties) {
                    return this.createElement(
                        this.c.span,
                        this.addLineNumberToProps(node.data.hProperties, node),
                        node.value,
                    )
                }
                return node.value
            }
            case 'image': {
                const src = node.url || ''
                const alt = node.alt || ''
                const title = node.title || ''
                return this.createElement(
                    this.c.img,
                    this.addLineNumberToProps(
                        {
                            src,
                            alt,
                            title,
                            ...node.data?.hProperties,
                        },
                        node,
                    ),
                )
            }
            case 'link': {
                const href = node.url || ''
                const title = node.title || ''
                return this.createElement(
                    this.c.a,
                    this.addLineNumberToProps(
                        { href, title, ...node.data?.hProperties },
                        node,
                    ),
                    this.mapMdastChildren(node),
                )
            }
            case 'strong': {
                return this.createElement(
                    this.c.strong,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'emphasis': {
                return this.createElement(
                    this.c.em,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'delete': {
                return this.createElement(
                    this.c.del,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    this.mapMdastChildren(node),
                )
            }
            case 'inlineCode': {
                if (!node.value) {
                    return []
                }
                return this.createElement(
                    this.c.code,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    node.value,
                )
            }
            case 'break': {
                return this.createElement(
                    this.c.br,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                )
            }
            case 'root': {
                if (node.data?.hProperties) {
                    return this.createElement(
                        this.c.div,
                        this.addLineNumberToProps(node.data.hProperties, node),
                        this.mapMdastChildren(node),
                    )
                }
                return this.createElement(
                    Fragment,
                    null,
                    this.mapMdastChildren(node),
                )
            }
            case 'table': {
                const [head, ...body] = React.Children.toArray(
                    this.mapMdastChildren(node),
                )
                return this.createElement(
                    this.c.table,
                    this.addLineNumberToProps(node.data?.hProperties, node),
                    head && this.createElement(this.c.thead, null, head),
                    !!body?.length &&
                        this.createElement(this.c.tbody, null, body),
                )
            }
            case 'tableRow': {
                return this.createElement(
                    this.c.tr,
                    this.addLineNumberToProps(
                        { className: '', ...node.data?.hProperties },
                        node,
                    ),
                    this.mapMdastChildren(node),
                )
            }
            case 'tableCell': {
                let content = this.mapMdastChildren(node)
                return this.createElement(
                    this.c.td,
                    this.addLineNumberToProps(
                        { className: '', ...node.data?.hProperties },
                        node,
                    ),
                    content,
                )
            }
            case 'definition': {
                return []
            }
            case 'linkReference': {
                let href = ''
                let title = ''
                mdastBfs(this.mdast, (child: any) => {
                    if (
                        child.type === 'definition' &&
                        child.identifier === node.identifier
                    ) {
                        href = child.url || ''
                        title = child.title || ''
                    }
                })

                return this.createElement(
                    this.c.a,
                    this.addLineNumberToProps(
                        { href, title, ...node.data?.hProperties },
                        node,
                    ),
                    this.mapMdastChildren(node),
                )
            }
            case 'footnoteReference': {
                return []
            }

            case 'footnoteDefinition': {
                return []
            }
            case 'html': {
                // html nodes appear when rendering plain markdown (not MDX) without
                // the remarkHtmlToMdx pre-processing plugin. They are intentionally
                // ignored here — use remarkHtmlToMdx from 'safe-mdx/markdown' to convert
                // them to mdxJsx nodes before passing the AST to MdastToJsx.
                return []
            }
            case 'imageReference': {
                return []
            }

            default: {
                mdastBfs(node, (node) => {
                    delete node.position
                })

                throw new Error(
                    `cannot convert node` + JSON.stringify(node, null, 2),
                )

                return []
            }
        }
    }
}


/** JS globals that eval-estree-expression treats as built-in values */
const ALLOWED_GLOBALS = new Set(['undefined', 'NaN', 'Infinity', 'true', 'false', 'null'])

/**
 * Walk an estree expression AST and collect top-level Identifier names
 * that are not defined in the given scope context. Skips property access
 * identifiers (e.g. `foo.bar` only checks `foo`, not `bar`), function
 * parameter bindings, and JS built-in globals.
 *
 * For short-circuit operators (||, ??, &&) and ternary expressions,
 * only checks the left/test operand since the right side may never
 * be evaluated at runtime.
 */
function findMissingIdentifiers(
    node: any,
    context: Record<string, any>,
    localBindings: Set<string> = new Set(),
): string[] {
    if (!node) return []
    const missing: string[] = []

    switch (node.type) {
        case 'Identifier':
            if (!ALLOWED_GLOBALS.has(node.name) && !(node.name in context) && !localBindings.has(node.name)) {
                missing.push(node.name)
            }
            break
        case 'MemberExpression':
            // Only check the object, not the property
            missing.push(...findMissingIdentifiers(node.object, context, localBindings))
            // Check computed properties like obj[expr]
            if (node.computed) {
                missing.push(...findMissingIdentifiers(node.property, context, localBindings))
            }
            break
        case 'CallExpression':
            missing.push(...findMissingIdentifiers(node.callee, context, localBindings))
            for (const arg of node.arguments || []) {
                missing.push(...findMissingIdentifiers(arg, context, localBindings))
            }
            break
        case 'BinaryExpression':
            missing.push(...findMissingIdentifiers(node.left, context, localBindings))
            missing.push(...findMissingIdentifiers(node.right, context, localBindings))
            break
        case 'LogicalExpression':
            // For ||, ??, && only check the left side statically.
            // The right side may never be evaluated at runtime.
            missing.push(...findMissingIdentifiers(node.left, context, localBindings))
            break
        case 'UnaryExpression':
            missing.push(...findMissingIdentifiers(node.argument, context, localBindings))
            break
        case 'ConditionalExpression':
            // Only check the test statically. The branches may never run.
            missing.push(...findMissingIdentifiers(node.test, context, localBindings))
            break
        case 'TemplateLiteral':
            for (const expr of node.expressions || []) {
                missing.push(...findMissingIdentifiers(expr, context, localBindings))
            }
            break
        case 'ArrowFunctionExpression':
        case 'FunctionExpression': {
            // Collect parameter names as local bindings
            const newBindings = new Set(localBindings)
            for (const param of node.params || []) {
                collectParamNames(param, newBindings)
            }
            missing.push(...findMissingIdentifiers(node.body, context, newBindings))
            break
        }
        case 'BlockStatement':
            for (const stmt of node.body || []) {
                // Register variable declarations (including destructuring) as local bindings
                if (stmt.type === 'VariableDeclaration') {
                    for (const decl of stmt.declarations || []) {
                        collectParamNames(decl.id, localBindings)
                        // Check the initializer for missing identifiers
                        if (decl.init) {
                            missing.push(...findMissingIdentifiers(decl.init, context, localBindings))
                        }
                    }
                    // Skip re-walking this statement since we already handled it
                    continue
                }
                missing.push(...findMissingIdentifiers(stmt, context, localBindings))
            }
            break
        case 'ExpressionStatement':
            missing.push(...findMissingIdentifiers(node.expression, context, localBindings))
            break
        case 'ReturnStatement':
            missing.push(...findMissingIdentifiers(node.argument, context, localBindings))
            break
        case 'ArrayExpression':
            for (const elem of node.elements || []) {
                if (elem) missing.push(...findMissingIdentifiers(elem, context, localBindings))
            }
            break
        case 'ObjectExpression':
            for (const prop of node.properties || []) {
                if (prop.value) missing.push(...findMissingIdentifiers(prop.value, context, localBindings))
            }
            break
        case 'SpreadElement':
            missing.push(...findMissingIdentifiers(node.argument, context, localBindings))
            break
        // Literal, JSXElement, etc. - no identifiers to check
    }

    return missing
}

/** Extract all bound names from a function parameter AST node */
function collectParamNames(param: any, names: Set<string>) {
    if (!param) return
    if (param.type === 'Identifier') {
        names.add(param.name)
    } else if (param.type === 'ObjectPattern') {
        for (const prop of param.properties || []) {
            if (prop.type === 'RestElement') {
                collectParamNames(prop.argument, names)
            } else {
                collectParamNames(prop.value, names)
            }
        }
    } else if (param.type === 'ArrayPattern') {
        for (const elem of param.elements || []) {
            if (elem) collectParamNames(elem, names)
        }
    } else if (param.type === 'RestElement') {
        collectParamNames(param.argument, names)
    } else if (param.type === 'AssignmentPattern') {
        collectParamNames(param.left, names)
    }
}

/** Resolve a JSX element name to a string, supporting both simple identifiers
 *  and member expressions like `UI.Card` or `A.B.C`. */
function getJsxElementName(name: any): string | null {
    if (!name) return null
    if (name.type === 'JSXIdentifier') return name.name
    if (name.type === 'JSXMemberExpression') {
        const object = getJsxElementName(name.object)
        const property = getJsxElementName(name.property)
        return object && property ? `${object}.${property}` : null
    }
    return null
}

function accessWithDot(obj, path: string) {
    return path
        .split('.')
        .map((x) => x.trim())
        .filter(Boolean)
        .reduce((o, i) => o[i], obj)
}

export function mdastBfs(
    node: Parent | Node,
    cb?: (node: Node | Parent) => any,
) {
    const queue = [node]
    const result: any[] = []
    while (queue.length) {
        const node = queue.shift()
        let r = cb && node ? cb(node) : node
        if (Array.isArray(r)) {
            queue.push(...r)
        } else if (r) {
            result.push(r)
        }
        if (node && 'children' in node && node.children) {
            queue.push(...(node.children as any))
        }
    }
    return result
}

type ComponentsMap = { [k in (typeof nativeTags)[number]]?: any } & {
    [key: string]: any
}

/**
 * Bind function parameters to argument values, handling Identifier,
 * ObjectPattern, ArrayPattern, RestElement, and AssignmentPattern nodes.
 * Writes bindings into `ctx` in place.
 */
function bindParams(
    params: any[],
    args: any[],
    ctx: Record<string, any>,
    visit: (node: any, context: any, parent?: any) => any,
) {
    for (let i = 0; i < params.length; i++) {
        const param = params[i]
        switch (param.type) {
            case 'Identifier':
                ctx[param.name] = args[i]
                break
            case 'RestElement':
                if (param.argument.type === 'Identifier') {
                    ctx[param.argument.name] = args.slice(i)
                }
                break
            case 'AssignmentPattern': {
                const val =
                    args[i] !== undefined
                        ? args[i]
                        : visit(param.right, ctx, param)
                if (param.left.type === 'Identifier') {
                    ctx[param.left.name] = val
                }
                break
            }
            case 'ObjectPattern': {
                const obj = args[i] || {}
                for (const prop of param.properties) {
                    if (prop.type === 'RestElement') {
                        const used = new Set(
                            param.properties
                                .filter((p: any) => p !== prop)
                                .map(
                                    (p: any) =>
                                        p.key?.name ?? p.key?.value,
                                ),
                        )
                        const rest: Record<string, any> = {}
                        for (const key of Object.keys(obj)) {
                            if (!used.has(key)) rest[key] = obj[key]
                        }
                        if (prop.argument.type === 'Identifier') {
                            ctx[prop.argument.name] = rest
                        }
                    } else {
                        const key =
                            prop.key.type === 'Identifier'
                                ? prop.key.name
                                : prop.key.value
                        if (prop.value.type === 'Identifier') {
                            ctx[prop.value.name] = obj[key]
                        } else if (
                            prop.value.type === 'AssignmentPattern'
                        ) {
                            const val =
                                obj[key] !== undefined
                                    ? obj[key]
                                    : visit(
                                          prop.value.right,
                                          ctx,
                                          prop.value,
                                      )
                            if (
                                prop.value.left.type === 'Identifier'
                            ) {
                                ctx[prop.value.left.name] = val
                            }
                        }
                    }
                }
                break
            }
            case 'ArrayPattern': {
                const arr = args[i] || []
                for (let j = 0; j < param.elements.length; j++) {
                    const elem = param.elements[j]
                    if (!elem) continue
                    if (elem.type === 'Identifier') {
                        ctx[elem.name] = arr[j]
                    } else if (
                        elem.type === 'RestElement' &&
                        elem.argument.type === 'Identifier'
                    ) {
                        ctx[elem.argument.name] = arr.slice(j)
                    }
                }
                break
            }
        }
    }
}

// Sentinel value to signal a return from inside a block body
const RETURN_SENTINEL = Symbol('return')

/**
 * Execute a block statement body (array of statements) using the
 * eval-estree-expression visitor's `this.visit`. Returns the value
 * from the first ReturnStatement encountered, or undefined.
 */
function executeBlockBody(
    body: any[],
    ctx: Record<string, any>,
    visit: (node: any, context: any, parent?: any) => any,
    parentNode: any,
): any {
    for (const stmt of body) {
        switch (stmt.type) {
            case 'ReturnStatement':
                return stmt.argument
                    ? visit(stmt.argument, ctx, stmt)
                    : undefined
            case 'ExpressionStatement':
                visit(stmt.expression, ctx, stmt)
                break
            case 'VariableDeclaration':
                for (const decl of stmt.declarations) {
                    const value = decl.init
                        ? visit(decl.init, ctx, decl)
                        : undefined
                    if (decl.id.type === 'Identifier') {
                        ctx[decl.id.name] = value
                    }
                }
                break
            case 'IfStatement': {
                const test = visit(stmt.test, ctx, stmt)
                if (test) {
                    if (stmt.consequent.type === 'BlockStatement') {
                        const result = executeBlockBody(
                            stmt.consequent.body,
                            ctx,
                            visit,
                            stmt,
                        )
                        if (result !== undefined) return result
                    } else if (
                        stmt.consequent.type === 'ReturnStatement'
                    ) {
                        return stmt.consequent.argument
                            ? visit(
                                  stmt.consequent.argument,
                                  ctx,
                                  stmt.consequent,
                              )
                            : undefined
                    } else {
                        visit(stmt.consequent, ctx, stmt)
                    }
                } else if (stmt.alternate) {
                    if (stmt.alternate.type === 'BlockStatement') {
                        const result = executeBlockBody(
                            stmt.alternate.body,
                            ctx,
                            visit,
                            stmt,
                        )
                        if (result !== undefined) return result
                    } else if (
                        stmt.alternate.type === 'ReturnStatement'
                    ) {
                        return stmt.alternate.argument
                            ? visit(
                                  stmt.alternate.argument,
                                  ctx,
                                  stmt.alternate,
                              )
                            : undefined
                    } else {
                        visit(stmt.alternate, ctx, stmt)
                    }
                }
                break
            }
        }
    }
    return undefined
}

/**
 * Custom visitors for eval-estree-expression that interpret arrow functions
 * and function expressions by walking the AST recursively, without using
 * `new Function()` or `eval()`. This makes them safe for Cloudflare Workers
 * and other edge runtimes that block dynamic code evaluation.
 *
 * The visitors are called with `this` bound to the Expression evaluator
 * instance, giving access to `this.visit()` for recursive evaluation.
 */
export function createSafeFunctionVisitors() {
    // Using a regular function (not arrow) so `this` is the Expression instance
    function functionExpressionVisitor(
        this: any,
        node: any,
        context: any,
    ) {
        const self = this
        return function (this: any, ...args: any[]) {
            const newContext = { ...context }
            bindParams(node.params, args, newContext, (n, ctx, p) =>
                self.visit(n, ctx, p),
            )

            if (
                node.expression ||
                node.body.type !== 'BlockStatement'
            ) {
                // Expression body: x => x.name
                return self.visit(node.body, newContext, node)
            }

            // Block body: x => { ... return ... }
            return executeBlockBody(
                node.body.body,
                newContext,
                (n, ctx, p) => self.visit(n, ctx, p),
                node,
            )
        }
    }

    return {
        ArrowFunctionExpression: functionExpressionVisitor,
        FunctionExpression: functionExpressionVisitor,
    }
}
