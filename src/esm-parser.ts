import type { SafeMdxError } from './safe-mdx.tsx'

export interface ParsedImport {
    componentName: string
    importUrl: string
    isDefault: boolean
}

/**
 * Validates if a string is a valid HTTPS URL
 */
function isValidHttpsUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'https:'
    } catch {
        return false
    }
}

/**
 * Parses ESM import statements from mdxjsEsm nodes
 * Only processes HTTPS imports for security
 */
export function parseEsmImports(
    node: any,
    onError: (error: SafeMdxError) => void
): Map<string, string> {
    const imports = new Map<string, string>()

    if (!node.data?.estree) {
        return imports
    }

    try {
        const program = node.data.estree
        
        for (const statement of program.body) {
            if (statement.type === 'ImportDeclaration' && 
                statement.source.value && 
                typeof statement.source.value === 'string') {
                
                const importUrl = statement.source.value
                
                // Validate URL
                if (!isValidHttpsUrl(importUrl)) {
                    onError({
                        type: 'esm-import',
                        message: `Invalid import URL: "${importUrl}". Only HTTPS URLs are allowed for security reasons.`,
                        line: node.position?.start?.line,
                    })
                    continue
                }
                
                // Process import specifiers
                for (const specifier of statement.specifiers) {
                    if (specifier.type === 'ImportDefaultSpecifier') {
                        imports.set(specifier.local.name, importUrl)
                    } else if (specifier.type === 'ImportSpecifier') {
                        const importedName = specifier.imported.type === 'Identifier' 
                            ? specifier.imported.name 
                            : String(specifier.imported.value)
                        imports.set(
                            specifier.local.name, 
                            `${importUrl}#${importedName}`
                        )
                    }
                }
            }
        }
    } catch (error) {
        onError({
            type: 'esm-import',
            message: `Failed to parse ESM import: ${error instanceof Error ? error.message : 'Unknown error'}`,
            line: node.position?.start?.line,
        })
    }

    return imports
}

/**
 * Extracts component info from an import map entry
 */
export function extractComponentInfo(importInfo: string): { importUrl: string; componentName: string } {
    const parts = importInfo.split('#')
    const importUrl = parts[0] ?? importInfo
    const componentName = importInfo.includes('#') ? (parts[1] ?? 'default') : 'default'
    
    return { importUrl, componentName }
}