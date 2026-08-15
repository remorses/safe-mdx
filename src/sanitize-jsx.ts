import type { ReactNode } from 'react'
import { eventHandlerAttributes } from './html/attributes.ts'

type CreateElementFunction = (
    type: any,
    props?: any,
    ...children: ReactNode[]
) => ReactNode

const DENIED_TAGS = new Set([
    'script',
    'object',
    'embed',
    'applet',
    'portal',
    'frame',
    'frameset',
    'base',
    'meta',
    'link',
])

const URL_ATTRS = new Set([
    'href',
    'src',
    'action',
    'formaction',
    'poster',
    'cite',
    'data',
    'background',
    'xlinkhref',
    'xlink:href',
])

const DEFAULT_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])

const DOM_EVENTS = new Set(eventHandlerAttributes.map((name) => name.toLowerCase()))

export function wrapCreateElement(
    createElement: CreateElementFunction,
    onError: (message: string) => void,
): CreateElementFunction {
    return (type, props, ...children) => {
        const tag = typeof type === 'string' ? type.toLowerCase() : null
        if (tag && isDeniedTag(tag)) {
            onError(`Blocked tag "${tag}"`)
            return null
        }
        return createElement(type, sanitizeProps(tag, props, onError), ...children)
    }
}

export function isDeniedTag(tag: string) {
    return DENIED_TAGS.has(tag)
}

function sanitizeProps(
    tag: string | null,
    props: Record<string, any> | null | undefined,
    onError: (message: string) => void,
) {
    if (props == null) return props
    const next = { ...props }
    if (next.dangerouslySetInnerHTML != null) {
        delete next.dangerouslySetInnerHTML
        onError('Removed prop "dangerouslySetInnerHTML"')
    }

    for (const key of Object.keys(next)) {
        if (shouldStripEventProp(key, tag)) {
            delete next[key]
            onError(`Removed prop "${key}"`)
            continue
        }
        const lower = key.toLowerCase()
        if (lower === 'srcdoc' || lower === 'ping') {
            delete next[key]
            onError(`Removed prop "${key}"`)
            continue
        }
        if (lower === 'srcset') {
            const sanitized = sanitizeSrcSet(next[key], tag, onError)
            if (sanitized == null) delete next[key]
            else next[key] = sanitized
            continue
        }
        if (URL_ATTRS.has(lower) && !isSafeUrl(next[key], isImageAttr(tag, lower))) {
            delete next[key]
            onError(`Removed unsafe URL in ${key}`)
        }
    }
    return next
}

function shouldStripEventProp(key: string, tag: string | null) {
    if (tag) return /^on/i.test(key)
    return DOM_EVENTS.has(key.toLowerCase())
}

function isImageAttr(tag: string | null, attr: string) {
    return tag === 'img' && (attr === 'src' || attr === 'srcset')
}

function sanitizeSrcSet(
    value: any,
    tag: string | null,
    onError: (message: string) => void,
) {
    if (typeof value !== 'string') {
        onError('Removed unsafe URL in srcSet')
        return undefined
    }
    if (/data:/i.test(value)) {
        const trimmed = value.trim()
        const descriptorMatch = /\s+(\d+[wx])$/i.exec(trimmed)
        const url = descriptorMatch ? trimmed.slice(0, descriptorMatch.index) : trimmed
        if (isSafeUrl(url, isImageAttr(tag, 'srcset'))) {
            return descriptorMatch ? `${url} ${descriptorMatch[1]}` : url
        }
        onError('Removed unsafe URL in srcSet')
        return undefined
    }
    const kept: string[] = []
    for (const candidate of value.split(',')) {
        const trimmed = candidate.trim()
        if (!trimmed) continue
        const url = trimmed.split(/\s+/, 1)[0] || ''
        const descriptor = trimmed.slice(url.length).trim()
        if (isSafeUrl(url, isImageAttr(tag, 'srcset'))) {
            kept.push(descriptor ? `${url} ${descriptor}` : url)
        } else {
            onError('Removed unsafe URL in srcSet')
        }
    }
    return kept.length ? kept.join(', ') : undefined
}

export function isSafeUrl(value: any, isImage: boolean): boolean {
    if (typeof value !== 'string') return false
    const trimmed = value.trim()
    if (!trimmed) return true
    const protocol = protocolOf(trimmed)
    if (!protocol) return true
    if (
        isImage &&
        protocol === 'data' &&
        /^data:image\/[a-z0-9.+-]+/i.test(trimmed.replace(/[\u0000-\u0020\u007f-\u009f]+/g, ''))
    ) {
        return true
    }
    return DEFAULT_PROTOCOLS.has(protocol)
}

function protocolOf(url: string): string | null {
    const normalized = url.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '')
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(normalized)
    const protocol = match?.[1]
    return protocol ? protocol.toLowerCase() : null
}
