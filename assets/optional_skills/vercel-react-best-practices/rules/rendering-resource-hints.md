---
title: Use React DOM Resource Hints
impact: HIGH
impactDescription: reduces load time for critical resources
tags: rendering, preload, preconnect, prefetch, resource-hints
---

## Use React DOM Resource Hints

**Impact: HIGH (reduces load time for critical resources)**

React DOM provides APIs to hint the browser about resources it will need. In a
SPA, use them for resources tied to the current app shell, visible route, or a
likely next interaction.

- **`prefetchDNS(href)`**: Resolve DNS for a domain you expect to connect to
- **`preconnect(href)`**: Establish connection (DNS + TCP + TLS) to an origin
- **`preload(href, options)`**: Fetch a resource (stylesheet, font, script, image) you'll use soon
- **`preloadModule(href)`**: Fetch an ES module you'll use soon
- **`preinit(href, options)`**: Fetch and evaluate a stylesheet or script
- **`preinitModule(href)`**: Fetch and evaluate an ES module

React DOM resource hint APIs can be called during render in a SPA. Prefer static
`<link>` tags in `index.html` for global resources and component-level calls only
when the resource is tied to a visible route or feature.

**Example (preconnect to third-party APIs):**

```tsx
import { preconnect, prefetchDNS } from "react-dom";

export default function App() {
  prefetchDNS("https://analytics.example.com");
  preconnect("https://api.example.com");

  return <main>{/* content */}</main>;
}
```

**Example (preload a route font and stylesheet from an app shell):**

```tsx
import { preload, preinit } from "react-dom";

export default function AppShell({ children }: { children: React.ReactNode }) {
  preload("/fonts/inter.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preinit("/styles/critical.css", { as: "style" });

  return <main>{children}</main>;
}
```

**Example (preload modules for code-split routes):**

```tsx
import { preloadModule, preinitModule } from "react-dom";

function Navigation() {
  const preloadDashboard = () => {
    preloadModule("/dashboard.js", { as: "script" });
  };

  return (
    <nav>
      <a href="/dashboard" onMouseEnter={preloadDashboard}>
        Dashboard
      </a>
    </nav>
  );
}
```

**When to use each:**

| API             | Use case                                    |
| --------------- | ------------------------------------------- |
| `prefetchDNS`   | Third-party domains you'll connect to later |
| `preconnect`    | APIs or CDNs you'll fetch from immediately  |
| `preload`       | Critical resources needed for current page  |
| `preloadModule` | JS modules for likely next navigation       |
| `preinit`       | Stylesheets/scripts that must execute early |
| `preinitModule` | ES modules that must execute early          |

Reference: [React DOM Resource Preloading APIs](https://react.dev/reference/react-dom#resource-preloading-apis)
