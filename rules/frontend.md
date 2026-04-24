# Frontend Rules — Next.js 14 / TypeScript / Tailwind

## Framework
- **Next.js 14 App Router** — use `app/` directory exclusively. No `pages/` directory.
- **TypeScript strict mode** — `"strict": true` in tsconfig. No `any` types.
- **pnpm** as package manager — never use npm or yarn.

## Components

### Server vs Client
- **Default to Server Components.** Only add `"use client"` when the component needs:
  - `useState`, `useEffect`, `useRef`, or other React hooks
  - Browser APIs (`window`, `document`, `localStorage`)
  - Event handlers (`onClick`, `onChange`, etc.)
- Keep client components as **leaf nodes** — push `"use client"` as far down the tree as possible.
- Never fetch data in client components — pass it down from server components or use server actions.

### File & Naming Conventions
- **One component per file**, named in PascalCase: `TraceViewer.tsx`.
- Co-locate component types in the same file or a sibling `.types.ts` file.
- Barrel exports (`index.ts`) only at the `components/` and `components/ui/` level.
- Hooks: `use` prefix, camelCase file: `useTraceData.ts`.

### Organization
```
components/
├── ui/              # shadcn/ui primitives (Button, Card, Dialog, etc.)
├── features/        # Feature-specific components
│   ├── trace/       # TraceViewer, TraceTimeline, etc.
│   ├── dashboard/   # DashboardCard, MetricGrid, etc.
│   └── analysis/    # FailureGraph, BlindSpotMap, etc.
└── layout/          # Header, Sidebar, Footer
```

## Styling
- **Tailwind CSS only** — no CSS modules, styled-components, or inline `style` props.
- Use **shadcn/ui** as the component library. Do not install MUI, Chakra, Ant Design, or others.
- Use `cn()` utility (from `lib/utils.ts`) for conditional class merging.
- Design tokens via Tailwind config — no hardcoded colors or spacing values in components.
- Responsive: mobile-first (`sm:`, `md:`, `lg:` breakpoints).

## Data Fetching
- **Server Components**: Use `async` component functions with direct `fetch()` or service calls.
- **Client-side**: Use `useSWR` or `@tanstack/react-query` for client-side data that needs real-time updates.
- **Server Actions**: For mutations (form submissions, data updates).
- **API Routes** (`app/api/`): BFF layer only — proxy calls to the Python backend. No direct external API calls from the frontend.

## State Management
- **URL state** (search params) for filterable/shareable views.
- **React Context** for theme/auth — keep contexts small and focused.
- **No Redux** — use Zustand if global client state is truly needed.

## Error Handling
- Use Next.js `error.tsx` boundary files per route segment.
- Use `loading.tsx` for suspense boundaries.
- Display user-friendly error messages — never expose stack traces or API details.

## Performance
- Use `next/image` for all images — never raw `<img>` tags.
- Use `next/link` for all internal navigation — never raw `<a>` tags for internal routes.
- Lazy load heavy components with `React.lazy()` or `next/dynamic`.
- Minimize client-side JavaScript — prefer server-rendered content.

## Accessibility
- All interactive elements must be keyboard-navigable.
- Use semantic HTML (`<nav>`, `<main>`, `<article>`, `<button>`).
- Images require `alt` text. Decorative images use `alt=""`.
- shadcn/ui components handle most a11y — don't override their ARIA attributes.
