---
'safe-mdx': patch
---

Fix `style` prop (and other expression-valued props) being silently dropped from JSX elements passed as expression props. Previously, `transformJsxElement` only handled `Literal` values inside `JSXExpressionContainer` attributes, so object expressions like `style={{ color: 'red' }}` were ignored. Now all expression types are evaluated via `evaluateExpression`, preserving `style`, arrays, computed values, and nested JSX elements on JSX-in-attribute elements.
