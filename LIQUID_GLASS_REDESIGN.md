# GrowthCrew — Apple Liquid Glass Design Redesign

## Goal

Redesign the entire GrowthCrew web app with Apple's **Liquid Glass** design language — the frosted-glass, translucent, depth-layered aesthetic introduced in iOS 26 / macOS 26 (Tahoe). Every surface should feel like it's made of layered glass with light refracting through it.

## What is Liquid Glass

Apple's Liquid Glass design system is characterized by:

1. **Translucency & blur** — Every surface (cards, sidebars, nav, modals) uses `backdrop-filter: blur()` with saturation boost. Content behind shows through softly, like frosted glass.

2. **Layered depth** — Background → glass surface → content. Multiple glass layers stack with increasing blur and slight scale. Shadows are soft, diffuse, and colored by the content behind.

3. **Specular highlights** — Subtle gradient borders (top-left brighter, bottom-right darker) simulate light hitting glass edges. 1px borders with `rgba(255,255,255,0.15-0.3)` on top, fading to transparent.

4. **Adaptive tinting** — Glass surfaces pick up color from what's behind them. Use `backdrop-filter: blur(20px) saturate(180%)` with semi-transparent backgrounds like `rgba(255,255,255,0.55)` (light) or `rgba(30,30,30,0.55)` (dark).

5. **Fluid motion** — Transitions are smooth, spring-like (cubic-bezier(0.34, 1.56, 0.64, 1)). Elements scale slightly (1.01-1.02) on hover. Glass surfaces shimmer subtly.

6. **Vibrant backgrounds** — Behind the glass, use rich gradient meshes (color blobs, mesh gradients) so the blur has something interesting to refract.

7. **Rounded everything** — Generous border-radius (16-24px for cards, 12-16px for buttons, 28px+ for sheets/modals).

8. **SF Pro aesthetic** — Clean, system font stack. Tight tracking on headers, relaxed on body. Weights: 400/500/600/700.

## Scope — All Pages

Redesign EVERY page and component in `apps/web/`:

### Layout & Navigation
- `app/(app)/layout.tsx` — glass sidebar, top bar with blur
- `components/app-nav.tsx` — glass nav items with specular hover
- `app/providers.tsx` — theme provider for light/dark glass

### Core pages
- `app/(app)/dashboard/page.tsx` — glass KPI cards, mesh gradient bg
- `app/(app)/campaigns/page.tsx` — glass data table
- `app/(app)/competitors/page.tsx` — glass cards
- `app/(app)/console/page.tsx` — glass console with voice orb
- `app/(app)/content/page.tsx` — glass content cards
- `app/(app)/knowledge/page.tsx` — glass knowledge cards
- `app/(app)/leads/page.tsx` + `leads/forms/page.tsx` — glass tables
- `app/(app)/proposals/page.tsx` + `[id]/page.tsx` — glass proposal cards
- `app/(app)/reviews/page.tsx` — glass review cards
- `app/(app)/settings/page.tsx` — glass settings panels
- `app/(app)/social/page.tsx` — glass social feed
- `app/(app)/audit/page.tsx` — glass audit report
- `app/(app)/agents/page.tsx` + `[id]/page.tsx` — glass agent cards
- `app/(app)/admin/page.tsx` — glass admin panel

### Auth pages
- `app/login/page.tsx` — glass login card on mesh gradient
- `app/register/page.tsx` — glass register card
- `app/onboarding/page.tsx` — glass onboarding steps

### Public pages
- `app/page.tsx` — glass landing/hero
- `app/f/[formId]/public-form.tsx` — glass public form

### UI components
- `components/ui/badge.tsx` — glass badge
- `components/ui/select.tsx` — glass select
- `components/ui/switch.tsx` — glass toggle
- `components/ui/table.tsx` — glass table
- `components/ui/tabs.tsx` — glass tabs
- `components/ui/textarea.tsx` — glass input

### Global styles
- `app/globals.css` — full liquid glass design system: CSS variables, utility classes, mesh gradient backgrounds, glass mixins, animations

## Implementation Details

### CSS Foundation (`globals.css`)

```css
:root {
  /* Glass tokens */
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-bg-dark: rgba(30, 30, 30, 0.55);
  --glass-border: rgba(255, 255, 255, 0.18);
  --glass-border-dark: rgba(255, 255, 255, 0.08);
  --glass-blur: 24px;
  --glass-saturate: 180%;
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  --glass-shadow-hover: 0 12px 40px rgba(0, 0, 0, 0.12);
  --glass-radius: 20px;
  --glass-radius-sm: 12px;
  --glass-radius-lg: 28px;
  
  /* Specular highlight */
  --glass-highlight: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%);
  
  /* Spring transitions */
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --smooth: cubic-bezier(0.4, 0, 0.2, 1);
}

.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow: var(--glass-shadow);
  position: relative;
}

.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--glass-highlight);
  pointer-events: none;
  opacity: 0.6;
}

.glass:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
  transition: all 0.3s var(--spring);
}

/* Mesh gradient background */
.mesh-bg {
  background: 
    radial-gradient(at 20% 20%, #6366f1 0%, transparent 50%),
    radial-gradient(at 80% 0%, #ec4899 0%, transparent 50%),
    radial-gradient(at 40% 80%, #06b6d4 0%, transparent 50%),
    radial-gradient(at 90% 70%, #f59e0b 0%, transparent 50%);
}

/* Dark mode */
.dark .glass {
  background: var(--glass-bg-dark);
  border-color: var(--glass-border-dark);
}
```

### Design Rules

1. **Every card/panel = `.glass`** — no opaque surfaces
2. **Sidebar = glass** with `blur(40px)` — stronger than cards
3. **Background = mesh gradient** — animated, slowly shifting
4. **Inputs = glass** with inset shadow, subtle inner glow on focus
5. **Buttons = glass** with specular top edge, press animation (scale 0.98)
6. **Tables = glass container** with translucent rows, dividers as `rgba(255,255,255,0.1)`
7. **Modals/sheets = glass** with `blur(40px)`, scale-in animation
8. **Nav items = glass** on hover, active state = stronger glass + tint
9. **Scroll = smooth** with glass scrollbar styling
10. **Dark mode = full support** — darker glass, colored mesh bg

### Animation

- Page transitions: fade + scale (0.98 → 1) over 300ms spring
- Card hover: translateY(-2px) + shadow increase + subtle scale(1.01)
- Button press: scale(0.98) over 100ms
- Sidebar items: slide-in stagger on page load (50ms delay each)
- Mesh background: slow 20s ease-in-out infinite alternate position shift
- Loading states: glass shimmer (skeleton with moving gradient)

## Execution

1. Start with `globals.css` — full design system
2. Then layout + sidebar + nav
3. Then dashboard (most visible page)
4. Then all remaining pages in order
5. Then UI components
6. Then auth + public pages
7. Run `pnpm --filter @growthcrew/web build` to verify
8. Commit when done

## Model

Use **Kimi K3** with **High thinking effort** for the best balance between token spend and capability.

## Important

- Do NOT break existing functionality — all routes must still work
- Do NOT remove any features — only change the visual layer
- Preserve all tRPC routes, API routes, auth, integrations logic
- Run `pnpm --filter @growthcrew/web build` after all changes to verify
- Commit with message: "design: Apple Liquid Glass redesign across all pages"