# Dunk AI Design System

## Purpose
This document serves as the **Single Source of Truth** for the visual design and UI system of the Dunk AI application. It is based directly on the current implementation in the codebase and provides exact tokens, values, and component styles.

## Design Philosophy
Dunk AI is designed as a **premium, technical, AI-focused hardware engineering copilot**. 
The visual personality heavily utilizes an **editorial yet highly technical** look, balancing typography-driven layouts with rich, colorful engineering diagrams (PCBs, node graphs). 
- **Dark Mode (Default)**: Cinematic hardware lab vibe. Rich charcoal backgrounds with glowing emerald and cyan accents.
- **Light Mode**: Bright engineering studio vibe. Warm ivory/off-white backgrounds (`#f8f7f3`) with deep charcoal text and high-contrast boundaries. 

---

## Color System

### 1. Design Color Overview
Dunk AI uses a dual-theme approach based on `globals.css` CSS variables. Dark mode is the baseline, conveying a cinematic hardware lab. Light mode is a warm, high-contrast engineering studio. Accent colors are used sparingly for active states, PCB components, and diagrams.

### 2. Dark Mode Colors

#### Backgrounds
| Token | Value | Usage | Source |
|---|---|---|---|
| `--background` | `#0a0a0a` | Main page background | `globals.css` |
| `--card` | `#141414` | Component/Card surfaces | `globals.css` |
| `--popover` | `#141414` | Popovers/Dropdowns | `globals.css` |
| `--sidebar` | `#0f0f0f` | Workspace sidebar bg | `globals.css` |
| `--muted` | `#424242` | Subtle backgrounds | `globals.css` |

#### Text
| Token | Value | Usage | Source |
|---|---|---|---|
| `--foreground` | `#f5f5f5` | Primary text | `globals.css` |
| `--card-foreground`| `#f5f5f5` | Text on cards | `globals.css` |
| `--popover-foreground` | `#f5f5f5` | Text in popovers | `globals.css` |
| `--muted-foreground` | `#a0a0a0` | Secondary/Subtle text | `globals.css` |

#### Controls
| Token | Value | Usage | Source |
|---|---|---|---|
| `--primary` | `#ffffff` | Primary buttons/actions | `globals.css` |
| `--primary-foreground`| `#000000` | Text on primary | `globals.css` |
| `--secondary` | `#1a1a1a` | Secondary buttons/surfaces | `globals.css` |
| `--secondary-foreground` | `#e0e0e0`| Text on secondary | `globals.css` |
| `--accent` | `#b9c0ca` | Accent elements | `globals.css` |
| `--accent-foreground`| `#111316` | Text on accent | `globals.css` |

#### Borders & Inputs
| Token | Value | Usage | Source |
|---|---|---|---|
| `--border` | `#262626` | Dividers/Borders | `globals.css` |
| `--sidebar-border` | `#262626` | Sidebar separators | `globals.css` |
| `--input` | `#1a1a1a` | Input backgrounds | `globals.css` |
| `--ring` | `#aeb6c1` | Focus rings | `globals.css` |


### 3. Light Mode Colors

#### Backgrounds
| Token | Value | Usage | Source |
|---|---|---|---|
| `--background` | `#f8f7f3` | Main page background | `globals.css` |
| `--card` | `#ffffff` | Component/Card surfaces | `globals.css` |
| `--popover` | `#ffffff` | Popovers/Dropdowns | `globals.css` |
| `--sidebar` | `#f8f7f3` | Workspace sidebar bg | `globals.css` |
| `--muted` | `#f1f0ec` | Subtle backgrounds | `globals.css` |

#### Text
| Token | Value | Usage | Source |
|---|---|---|---|
| `--foreground` | `#18191c` | Primary text | `globals.css` |
| `--card-foreground`| `#18191c` | Text on cards | `globals.css` |
| `--popover-foreground` | `#18191c` | Text in popovers | `globals.css` |
| `--muted-foreground` | `#4a4b50` | Secondary/Subtle text | `globals.css` |

#### Controls
| Token | Value | Usage | Source |
|---|---|---|---|
| `--primary` | `#111111` | Primary buttons/actions | `globals.css` |
| `--primary-foreground`| `#ffffff` | Text on primary | `globals.css` |
| `--secondary` | `#edece8` | Secondary buttons/surfaces | `globals.css` |
| `--secondary-foreground` | `#2b2d31`| Text on secondary | `globals.css` |
| `--accent` | `#10b981` | Accent elements | `globals.css` |
| `--accent-foreground`| `#ffffff` | Text on accent | `globals.css` |

#### Borders & Inputs
| Token | Value | Usage | Source |
|---|---|---|---|
| `--border` | `#e2e0d5` | Dividers/Borders | `globals.css` |
| `--sidebar-border` | `#e2e0d5` | Sidebar separators | `globals.css` |
| `--input` | `#ffffff` | Input backgrounds | `globals.css` |
| `--ring` | `#10b981` | Focus rings | `globals.css` |


### 4. Shared / Semantic Colors

#### Destructive / Error
| Token | Value | Usage | Source |
|---|---|---|---|
| `--destructive` | `#ef4444` | Error states/destructive | `globals.css` |


### 5. Accent Colors

#### Emerald
- **Value**: `#10b981` / `text-emerald-500` / `bg-emerald-500`
- **Used for**: Primary success states, active traces on the PCB visual, glowing elements, "Get Started" gradients, Light Mode focus ring (`--ring`), Light Mode accent, and the primary brand accent.

#### Cyan
- **Value**: `#06b6d4` / `text-cyan-500`
- **Used for**: Gradients (combined with Emerald for CTA buttons, active lines) and secondary data nodes (e.g., NET requirements).

#### Violet
- **Value**: `#8b5cf6` / `text-violet-500`
- **Used for**: Dimensional/structural data nodes in technical diagrams (e.g., DIM requirements).

#### Amber
- **Value**: `#b45309`, `#f59e0b`, `text-amber-500`, `fill-amber-500`
- **Used for**: PCB copper traces, warnings, favorite icons in the workspace.

#### Red
- **Value**: `#ef4444` / `text-destructive`
- **Used for**: Delete actions, error alerts, destructive states.


### 6. Gradients

#### Primary CTA / Hover Glows
```text
Emerald (#10b981) → Cyan (#06b6d4)
```
- **Usage**: Hover underlines in navigation, CTA button highlights and glows.
- **Source**: `navigation.tsx`, `hero-section.tsx`

#### Node Active Gradients
```text
Emerald (#10b981) → Cyan (#06b6d4) → Blue (#3b82f6)
```
- **Usage**: Active nodes in the vertical pipeline diagram.
- **Source**: `how-it-works-section.tsx`

#### PCB Background Ambience
```text
radial-gradient: rgba(16,185,129,0.12) → transparent
```
- **Usage**: Provides a subtle colored ambiance in the Hero section.
- **Source**: `hero-section.tsx`


### 7. Component-Specific Colors

#### Hero / PCB
- **PCB Base (Dark Emerald)**: `#061f12`
- **PCB Ground Plane (Slightly lighter)**: `#092f1a`
- **Amber Traces / Copper**: `#b45309`
- **Fine Cyan Traces**: `#06b6d4`
- **Active Signal Trace (Glowing)**: `#0ea5e9` with red-glow filter
- **Mounting Holes / Vias**: `#0B1A13`, `#000`, metal gradients (`#a1a1aa` to `#d4d4d8`).
- **Status LEDs**: `fill="#10b981"` and `fill="#06b6d4"`.
- *Note: The PCB visual deliberately stays dark green even in Light Mode.*

#### How It Works
- **Node Colors**: `bg-secondary` to `bg-foreground` / gradient borders on active.
- **Connector Colors**: `bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent`.
- **Diagram Accents**: PWR=Emerald, NET=Cyan, DIM=Violet indicators.

#### Footer
- **Background**: `bg-card`
- **Text**: `text-foreground/70` for high contrast against ivory.

### Color Quick Reference

#### Dark Mode
```text
Background    #0a0a0a
Card          #141414
Foreground    #f5f5f5
Primary       #ffffff
Secondary     #1a1a1a
Muted         #424242
Border        #262626
```

#### Light Mode
```text
Background    #f8f7f3
Card          #ffffff
Foreground    #18191c
Primary       #111111
Secondary     #edece8
Muted         #f1f0ec
Border        #e2e0d5
```

#### Accent
```text
Emerald       #10b981
Cyan          #06b6d4
Violet        #8b5cf6
Amber         #b45309, #f59e0b
Red           #ef4444
```

---

## Typography

### Font Families
- **Sans-serif (Primary)**: `Instrument Sans`, `system-ui`, `sans-serif` (Assigned to `--font-sans`). Used for body, labels, UI components.
- **Serif (Display)**: `Playfair Display`, `serif` (Assigned to `--font-playfair` in `layout.tsx`). Used specifically for the "DunkAI" logo, Hero heading ("From idea to manufacturing"), and editorial headers.
- **Monospace**: `JetBrains Mono`, `monospace` (Assigned to `--font-mono`). Used heavily for technical metadata, badges, code, and PCB/Engineering diagram labels.

### Typography Rules
- **Sans-serif**: Main content, navigation links, descriptions (`font-light` to `font-medium`).
- **Serif Italic**: Editorial emphasis (e.g., `font-serif italic text-4xl`).
- **Monospace**: Technical info, uppercase tracking tags (`text-[10px] uppercase tracking-widest font-mono`).

---

## Sizing & Spacing System
- **Container Max-Widths**: `max-w-[1400px]` for navbar/footer, `max-w-[1600px]` for Hero, `max-w-[1200px]` for standard sections.
- **Section Padding**: `py-24 lg:py-32` or `py-32 lg:py-48` used heavily in landing page sections to create breathable, premium pacing.
- **Gap & Margin**: Standard Tailwind scale. Common pairings: `gap-6`, `mb-24`.

---

## Borders & Radii

### Border Radius
- **Standard UI** (`radius` variable): `0.5rem` (`rounded-lg`).
- **Cards**: Often `rounded-2xl` or `rounded-3xl` for large landing page sections (e.g., Auth Shell, Pricing).
- **Buttons**: Pill-shaped `rounded-full` for landing page CTAs.

### Borders
- **Cards/Sections**: use `border border-border`.
- **Subtle highlights**: use `border-emerald-500/10` or hover states with `hover:border-emerald-500/30`.

---

## Shadows
- **Standard UI Shadows**: `shadow-sm` for buttons and sidebar items.
- **Card Shadows (Light Mode priority)**: `shadow-2xl` or `shadow-xl` used on featured cards to lift them from the background.
- **PCB Drop Shadow**: `drop-shadow-[0_20px_40px_rgba(0,0,0,0.3)]` (Light Mode) and `rgba(0,0,0,0.8)` (Dark Mode) for realism.
- **Glows (SVG)**: `filter="url(#glow)"` using `feGaussianBlur` is heavily used inside SVG diagrams to simulate glowing LEDs and active nodes.

---

## Buttons
Source: `frontend/components/ui/button.tsx` and custom inline buttons.
- **Primary CTA (Landing)**: `rounded-full px-8 lg:px-10 h-14`. Features a complex nested gradient border, inner dark gradient background, and a translating shine effect on hover. Contains an arrow icon in a circular wrapper.
- **Navigation CTA (Get Started)**: `rounded-full h-10 px-6 bg-card border-border hover:border-emerald-500/40 hover:bg-secondary`. Uses `hover:-translate-y-0.5 active:scale-95`.
- **Icon Button / Sidebar Toggle**: `h-8 w-8 rounded-xl border-sidebar-border bg-background/80 hover:bg-sidebar-accent`.

---

## Navigation
Source: `frontend/components/landing/navigation.tsx`
- **Behavior**: Fixed to top. Transitions from transparent (`top-6`) to a backdrop-blur floating header (`top-4 bg-background/90 backdrop-blur-2xl border-border shadow-sm`) upon scroll (`> 20px`).
- **Links**: `text-sm font-medium text-foreground/90 hover:text-emerald-600`. Includes a bottom animating gradient underline on hover.
- **Mobile**: Hamburger icon triggers a full-screen overlay menu with staggered fade-in animations for large serif links.

---

## Theme System
- **Engine**: `next-themes` (ThemeProvider toggling a `.light` or `.dark` class).
- **Default**: Dark mode (`defaultTheme="dark"`).
- **Structure**: Variables defined in `:root` (dark defaults) and `.light` (light overrides).
- **Forced Dark**: Uses `.force-dark` utility to force specific subtrees (like the EDA canvas or PCB viewer) to remain in dark mode regardless of the global theme.

---

## Layout & Responsiveness
### Breakpoints (Tailwind Defaults)
| Breakpoint | Width | Main Behavior |
|---|---:|---|
| `sm` | `640px` | Minor padding adjustments |
| `md` | `768px` | Tablet layouts, Navigation switches from hamburger to inline links |
| `lg` | `1024px` | Desktop layouts, Hero text scales up significantly, Sidebars become persistent |

### Section Specifics
- **Hero**: `flex-col` on mobile, `flex-row` on `lg`. Typography scales from `clamp(3.5rem, 7vw, 7rem)`.
- **How It Works**: Single vertical timeline line on mobile (`left-[31px]`), alternating snake layout with center connector on desktop (`lg:grid-cols-[1fr_80px_1fr]`).
- **Workspace**: Sidebar uses absolute/drawer behavior on mobile, flex fixed on desktop. Controlled by `sidebarCollapsed` state.

---

## Landing Page
1. **Hero (`hero-section.tsx`)**: Typography left, SVG PCB visual right. Ambient background gradients.
2. **Features (`features-section.tsx`)**: Grid of cards. Each card uses `bg-card border-border` with a dedicated SVG visual (e.g., Node map, Blueprint, Chat UI mock).
3. **How It Works (`how-it-works-section.tsx`)**: Scroll-triggered vertical pipeline (`IntersectionObserver`). Alternating cards on desktop. Glowing nodes in the center.
4. **Metrics (`metrics-section.tsx`)**: 3-column layout highlighting technical speeds. Huge numeric typography.
5. **Pricing (`pricing-section.tsx`)**: 3 cards. The "Pro" card is highlighted with `shadow-2xl` and a subtle inner border glow.
6. **Footer (`footer-section.tsx`)**: Grounded in `bg-card` for separation. High contrast text (`text-foreground/70`) for links.

---

## Workspace
Source: `frontend/components/workspace/*`

### Sidebar (`sidebar.tsx`)
- **Structure**: Collapsible width. Top header with Workspace title and search input. Scrollable project list. Bottom fixed settings/upgrade actions.
- **Project Items**: `rounded-xl` buttons. Hover state triggers a dropdown context menu for Favorite/Duplicate/Archive/Delete. Active state uses `bg-sidebar-accent text-sidebar-foreground`.
- **Views Menu**: Tab switchers (Chat, Requirements, Architecture, etc.) with consistent Lucide icons.

---

## Auth
Source: `frontend/components/auth/auth-shell.tsx`
- **Structure**: 50/50 split on desktop. Left side contains the form centered vertically. Right side contains a full-bleed rounded image (`hardware_workbench.jpg`).
- **Styling**: The central form sits inside a `rounded-3xl border border-border bg-card shadow-2xl backdrop-blur-xl` container.

---

## Animations
- **Scroll Reveals**: Widespread use of `IntersectionObserver`. Elements start with `opacity-0 translate-y-8` and transition to `opacity-100 translate-y-0` with `duration-1000 ease-out`. Staggered delays (e.g., `delay-200`, `delay-500`).
- **SVG Animations**: 
  - `animate-pulse` for cursor blinking.
  - `<animate>` tags inside SVG for moving traces (`stroke-dashoffset`, `stroke-dasharray`).
  - Opacity fading for glowing LEDs.
- **Hover Effects**: Buttons use `hover:-translate-y-0.5` and `active:scale-95`.

---

## Design Token Quick Reference

### Typography
| Element | Font | Weight | 
|------|------|------|
| Logo/Hero Heading | Playfair Display (Serif) | Normal / Italic |
| Body / UI | Instrument Sans | Light / Medium / Semibold |
| Technical Tags | JetBrains Mono | Normal / Bold |

### Shapes
| Component | Radius |
|------|------|
| Landing CTAs | `rounded-full` |
| General Cards | `rounded-2xl` / `rounded-3xl` |
| Workspace Sidebar Buttons | `rounded-xl` |
| Standard Inputs | `rounded-md` (`var(--radius)`) |

---

## Future UI Change Rules
1. **Preserve existing design tokens**: Always use semantic variables (`bg-background`, `text-muted-foreground`).
2. **Maintain the Light/Dark contrast**: Light mode is warm/ivory, Dark mode is cinematic/black. Ensure new components look premium in both.
3. **Engineering Diagrams**: SVGs like the PCB must remain structurally technical. If adding a new diagram, use the existing palette of Emerald, Cyan, Violet, and Amber.
4. **Do not create duplicate UI components**: Reuse Radix primitives from `components/ui`.
5. **Keep animations elegant**: Stick to long durations (`duration-700` or `1000`) and soft easing for entrance animations.
6. **Do not change application logic**: UI work should remain strictly visual.

---

## Design Source Files

### Global
- `frontend/app/globals.css`
- `frontend/app/layout.tsx`

### Landing
- `frontend/components/landing/navigation.tsx`
- `frontend/components/landing/hero-section.tsx`
- `frontend/components/landing/features-section.tsx`
- `frontend/components/landing/how-it-works-section.tsx`
- `frontend/components/landing/metrics-section.tsx`
- `frontend/components/landing/pricing-section.tsx`
- `frontend/components/landing/footer-section.tsx`

### Workspace & Auth
- `frontend/components/workspace/sidebar.tsx`
- `frontend/components/auth/auth-shell.tsx`
- `frontend/components/ui/button.tsx`
