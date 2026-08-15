---
'safe-mdx': minor
---

Add an opt-in `sanitize` boolean that strips XSS vectors from native JSX and markdown HTML. It is **off by default**, so existing render output does not change.

```tsx
<SafeMdxRenderer markdown={code} mdast={mdast} sanitize />
```

When `sanitize` is on, `createElement` drops `script`, `object`, `embed`, and `base`. It also removes `dangerouslySetInnerHTML`, native `on*` handlers, `srcDoc`, and URLs that are not `http`, `https`, `mailto`, `tel`, relative, or `data:image/*` on `img`. `<style>`, `<meta>`, `<link>`, and `http(s)` iframes stay allowed. `srcDoc`, `javascript:`, and `data:` iframe or link sources are still stripped.

There is no allowlist object. The policy is fixed. Function evaluation being off is not enough on its own, because object literals such as `dangerouslySetInnerHTML={{__html}}` still evaluate.

Stripped tags and props emit `type: 'sanitize'` errors.
