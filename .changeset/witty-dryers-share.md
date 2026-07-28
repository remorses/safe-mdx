---
'safe-mdx': patch
---

Declare `react-dom` as a peer dependency. The package imports `prefetchDNS` and `preconnect` from `react-dom` in `dynamic-esm-component`, which the main `safe-mdx` entry pulls in via the self-referencing `import { DynamicEsmComponent } from 'safe-mdx/client'`. Because only `react` was declared as a peer, pnpm built a react-only variant such as `safe-mdx@1.11.5_react@19.2.8` and never linked `react-dom` into it, so strict-linking installs crashed at runtime with `Cannot find package 'react-dom' imported from .../safe-mdx/dist/dynamic-esm-component.js`. With the peer declared, the virtual store key becomes `safe-mdx@1.11.5_react-dom@19.2.8_react@19.2.8` and the import resolves. Consumers that added a `pnpm.packageExtensions` workaround for this can now remove it.
