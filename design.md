# Cruxer — Product Design System

## Product character

Cruxer is the calm, exacting workspace for someone about to do something difficult: explain why they are the right person for a role. It should feel like a well-made research notebook with the speed and feedback of a modern product—not a generic “AI generator.”

The design principle is **editorial intelligence**:

- **Focused:** one high-value task per view; dense information is progressively revealed.
- **Evidenced:** research, coverage, and generation states are visible instead of implied.
- **Tactile:** edits, reordering, and study actions respond instantly.
- **Calm:** strong typography, restrained color, deliberate whitespace, and no decorative noise.

The product is desktop-first for building a substantial kit, but every core action remains comfortable on a phone.

## Visual direction

### Colour system

Default to a warm, paper-like light theme with a true dark theme. Dark mode is a complete palette, not inverted light UI.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F7F7F2` | `#101111` | App background |
| `surface` | `#FFFFFF` | `#181A1A` | Cards, sheets, dialogs |
| `surface-raised` | `#FEFEFC` | `#202323` | Hovered/floating surfaces |
| `ink` | `#17181B` | `#F4F4EE` | Primary text |
| `muted-ink` | `#686B6D` | `#A7ABAA` | Supporting text |
| `line` | `#E7E7DF` | `#2D3030` | Borders and separators |
| `signal` | `#D75D38` | `#FF8A66` | Primary action and active states |
| `signal-strong` | `#B94525` | `#FFA385` | Hover/pressed primary states |
| `success` | `#287A5C` | `#58C59A` | Complete/covered |
| `warning` | `#A86612` | `#F4B75A` | Partial research/attention |
| `danger` | `#C3413D` | `#FF7770` | Destructive/error |
| `violet` | `#6257BC` | `#A99EFF` | Practice and study affordances |

Use `signal` sparingly: it means “do this next,” not “AI.” Coverage and status always pair color with an icon and written state. The palette must meet WCAG AA contrast for normal text; automated contrast checks are part of visual QA.

### Typography

- **Workspace interface and body — DM Sans:** a warmer, more deliberate alternative to Geist for the authenticated product; its wider forms improve large dashboard numerals and dense controls without changing the product’s overall voice. It is loaded with `next/font` and scoped to the workspace only.
- **Landing interface and body — Geist Sans:** retained for the public marketing route so the product revamp does not disturb the landing page.
- **Editorial display — Instrument Serif:** limited to the landing hero, kit title, and major empty-state statements. Its italic is used only for one short emphasis; never within forms, data tables, or dense kit content.
- **Code, IDs, and durations — Geist Mono:** source URLs, requirement IDs, keyboard hints, timer values, and technical labels.

Type scale uses `clamp()` for headings and a 4px rhythm:

| Role | Desktop | Mobile | Weight / line height |
| --- | --- | --- | --- |
| Display | 56px | 40px | Instrument Serif 400 / 0.98 |
| Page title | 32px | 28px | DM Sans 600 / 1.1 |
| Section title | 20px | 18px | DM Sans 600 / 1.25 |
| Body | 15px | 15px | DM Sans 400 / 1.55 |
| UI label | 13px | 13px | DM Sans 600 / 1.25 |
| Meta | 12px | 12px | Geist 500 / 1.35 |

Never use a font below 12px or all-caps paragraphs. Metadata may use 0.04em tracking; headings and body use normal tracking.

### Layout, surfaces, and iconography

- Desktop shell: centred 1440px workspace frame, quiet top utility bar, and a floating four-item dock at the bottom centre. The dock makes wide screens feel balanced while retaining a constant spatial home for the core actions.
- Phone shell: compact top bar and an inset-width bottom dock; forms and primary actions remain in natural thumb reach.
- Base spacing is 4px; common increments are 8, 12, 16, 24, 32, 48, and 64px.
- Cards have a 16px radius and a 1px `line` border. Use a subtle 1–2px upward hover lift only when a card is clickable; no heavy permanent shadows.
- Floating items (popover, command palette, toast) use a soft ambient shadow and a 20px radius. Sheets use a 24px top radius.
- Use Lucide icons at 16px or 18px. An icon is never the sole label for a destructive or consequential action.

## Component foundation

Build owned components from shadcn/ui patterns, Radix primitives, Tailwind semantic CSS variables, Lucide icons, and a small GSAP enhancement layer. This combines mature accessible behavior with a distinct Cruxer visual system; it is not an off-the-shelf shadcn theme. Radix’s primitives supply keyboard navigation, focus management, and ARIA patterns, while shadcn’s component catalogue covers the needed controls.

| Component | Cruxer treatment | Important behaviour |
| --- | --- | --- |
| `Button` | 44px primary, quiet secondary, ghost utility, destructive outline | Loading label/width stays stable; Enter submits the primary form. |
| `Field` / `Textarea` | Editorial label, optional helper, inline validation, character/count affordance | Clear error text linked by `aria-describedby`; JD textarea supports comfortable long input. |
| `StatusPill` | Icon + plain-language label: Ready, Researching, Partial, Needs attention | Never conveys state by color alone. |
| `ProgressRail` | Named steps with live current-message and a real completed count | Does not show fictional percentages. |
| `InsightCard` | Bordered card with heading, source/meta row, optional action slot | Can collapse dense supporting detail on mobile. |
| `QuestionCard` | Requirement chips, difficulty dots with text label, inline answer outline | Drag handle plus explicit move-up/down and category-menu alternatives. |
| `Flashcard` | Large, focused front/back surface with reveal and confidence actions | Keyboard: Space reveal; 1/2/3 record confidence after reveal. |
| `CoverageMap` | Compact requirement rows, covered check or action-linked gap | Makes the deterministic coverage result inspectable. |
| `SourceChip` | Domain name, external-link icon, tooltip/full URL | Opens in a new tab with safe rel attributes. |
| `CommandMenu` | `⌘/Ctrl + K` kit switcher and actions | Searchable keyboard-first navigation with a compact spring entrance. |
| `WorkspaceDock` | Floating Home / New kit / Practice / Settings navigation | Shared active indicator, primary New kit action, and safe-area-aware mobile placement. |
| `ToastViewport` | Top-centre transient success/information feedback | Dismissible, polite live region; never obscures a form field or the bottom dock. |

Use a maximum of three visual weights per view: canvas, surface, and active/raised. Gradients are restricted to the landing hero’s subtle radial background and practice-session progress glow; never behind text or status data.

## Experience blueprint

### 1. Landing and authentication

The landing page communicates one promise: “Turn a role into a plan you can defend.” It uses a spare editorial hero, a small interactive-looking kit preview, and one CTA. No pricing, testimonial carousel, or feature-grid scope.

Auth is a centred, low-distraction panel with an adjacent short statement of value. Password rules are visible before submit. A successful login transitions directly to the dashboard.

### 2. Dashboard and new-kit flow

The dashboard is a bento-style command centre: an editorial greeting and action panel, five compact workspace metrics, a wide cross-kit readiness surface, daily-effort graph, and responsive kit tiles. Each tile still shows role, company, coverage state, update time, and a single contextual action—visual richness does not hide operational detail.

The new-kit flow is an intentional two-column form on desktop:

```text
┌──────────────────────────────────────────────────────────────────┐
│ New preparation kit                                 Save draft    │
├────────────────────────────────┬─────────────────────────────────┤
│ Job description                │ Interview window                │
│ [large, line-numbered textarea]│ [  5  days  ]                   │
│                                │                                 │
│ Company website                │ What happens next               │
│ [https://…                 ]   │ • Research company site         │
│                                │ • Find interview discussion     │
│ [Generate my kit →]            │ • Build and check your plan     │
└────────────────────────────────┴─────────────────────────────────┘
```

On mobile, the “what happens next” panel becomes a compact disclosure below the form. Batch JSON upload is visually secondary but obvious, with a downloadable example and row-level validation before generation.

### 3. Generation room

Generation has its own durable screen so reloads are safe. A left-aligned progress rail makes the real sequence legible: Inputs → Company research → Role signals → Question bank → Coverage pass → Study plan. The active step has a small pulse and plain-language activity message; complete steps show a time and any warnings.

Research findings appear as source chips as they arrive. A partial state is never visually styled as failure: amber callouts explain what was skipped and affirm that the kit can still be useful. Failure shows an actionable error card with retry/reopen options and preserves completed work.

### 4. Kit builder

The builder feels like a focused research canvas rather than an admin dashboard.

```text
┌───────────────┬────────────────────────────────────────────────────┐
│ Cruxer        │ Atlas · Senior Frontend Engineer     [Ready  ✓]    │
│               ├────────────────────────────────────────────────────┤
│ ◉ Overview    │ Company brief                   [Regenerate]        │
│ ◌ Questions   │ ┌──────────────────────────────────────────────┐   │
│ ◌ Flashcards  │ │ What Atlas does …           sources · 3       │   │
│ ◌ Study plan  │ └──────────────────────────────────────────────┘   │
│               │                                                    │
│ + New kit     │ Questions                     18 · all covered     │
│               │ [All] [Technical] [Behavioural] [System design]    │
│               │ ┌──────────────────────── Question card ────────┐  │
│               │ │ ⠿ React architecture · Must · Difficulty 2    │  │
│               │ │ Explain how you would…                         │  │
│               │ │ Answer outline…              [•••]            │  │
│               │ └───────────────────────────────────────────────┘  │
└───────────────┴────────────────────────────────────────────────────┘
```

- A narrow top context bar always shows kit identity, readiness, last save state, and the primary **Practice** action.
- Overview presents company brief, requirements, sources, coverage, and schedule preview in an intentional reading sequence.
- Question categories use count tabs rather than independently scrolling columns. The active category has a quiet underline, not a filled pill wall.
- Inline edit replaces only the content region and preserves card height. `Esc` cancels, `⌘/Ctrl + Enter` saves, and a “Saved” micro-status confirms persistence.
- The category regeneration menu states exactly what will be preserved: “Your 3 edited questions will stay.” Regenerate requires confirmation only if it replaces unedited generated content.
- Drag uses dnd-kit with a visible insertion line, while keyboard buttons and context menu provide equal functionality.
- Destructive actions live in an overflow menu and always name the target in their confirmation dialog.

### 5. Practice mode

Practice is deliberately quieter and nearly full-screen. It opens on the least-confident, least-recently-reviewed card and shows session progress as “3 of 12 reviewed,” not a gamified score.

Before reveal, the card has one focal action. After reveal, confidence actions are concrete: **Not yet**, **Getting there**, **Confident** (mapped to 1, 2, 3). The next card slides only 8px with an opacity transition; reduced-motion users receive a fade. A small session sidebar on desktop (or drawer on mobile) exposes reviewed and remaining cards without forcing a context switch.

### 6. Study plan

The schedule uses a vertical day rail: Day 1 begins with a signal accent, later days recede slightly, and each day has focus, question count, and integer minutes. Requirement chips make must-have coverage discoverable. On mobile, days become an accordion with a persistent “Day X / Y” progress indicator.

### 7. Readiness runway and daily effort

The preparation view adds a compact **Readiness runway** above the detailed schedule. It answers three questions at a glance: *what should I do today?*, *how many study days remain?*, and *am I building confidence over time?* It does not pretend to know an interview calendar date—the brief supplies a number of days, so the UI truthfully shows `Day X of N` and `N − X study days remaining`.

- **Today card:** the next schedule day’s focus, exact minutes, question count, and one “Begin practice” action. Completed material is visible but never blocks the next action.
- **Runway:** a horizontal sequence of the exact requested days. Each stop contains a day number, focus, minutes, and status icon/text (up next, in progress, complete). It scrolls horizontally on phones and is an accordion after the summary, avoiding a dense, fake calendar.
- **Daily effort graph:** a GitHub-inspired, bounded grid covering the preparation window—not a year-long streak. A cell represents a study day and its intensity reflects completed practice effort (no activity, started, reviewed, confident). It has an adjacent textual total, visible legend, `aria-label` on every cell, keyboard-focusable buttons, and a tooltip with the date/day, reviews, and confidence. Color is reinforced by icon/pattern/title so it is never the sole carrier of status.
- **Useful reflection, not gamification:** the graph never uses shame-oriented streak copy. A quiet “Last session” and “least-confident topics next” link turns history into the next concrete preparation action.

## Motion and feedback

Motion is functional, short, and composited where possible. CSS transitions remain the default for routine state feedback; GSAP is reserved for the few sequences where its timeline control adds visible value.

### GSAP moments

| Surface | GSAP treatment | Why it earns the dependency |
| --- | --- | --- |
| Landing hero | On first view only, the promise, kit preview, and evidence chips enter in one 420ms staggered timeline. | Establishes craft without a distracting scroll spectacle. |
| Generation completion | The completed progress rail resolves into the first kit-summary cards with a short, ordered reveal. | Makes a long-running process feel conclusively finished and directs attention to results. |
| Practice-card transition | On confidence selection, the card exits/fades and the next card enters as a controlled 180ms sequence; progress updates in the same timeline. | Gives repeated study actions a satisfying, coherent rhythm. |
| Builder reordering | A FLIP-style position transition is applied only after a successful reorder. | Confirms what moved while preserving the user’s spatial map. |

GSAP is used for dashboard section reveals as content enters the viewport; each trigger runs once and is scoped/cleaned up with `@gsap/react`. It is explicitly not used for parallax, animated backgrounds, loading spinners, form validation, dialogs, or every hover state. No premium-only GSAP plugin is required.

Implementation rules:

- Place GSAP code only in client components. Register `useGSAP`, scope every timeline to a component ref, and rely on its context cleanup on unmount/update.
- Use `contextSafe()` for interaction callbacks that create animations after initial render.
- Gate every nonessential GSAP sequence behind `prefers-reduced-motion: no-preference` via `gsap.matchMedia()`. Reduced-motion users receive an immediate state change or short opacity fade; no transform/layout sequence runs.
- Do not use `ScrollTrigger`; Cruxer is an application, not a scrolling marketing animation.

### Universal motion rules

- 120–160ms for hover/focus/press feedback; 180–220ms for cards, dialogs, and section changes.
- Use opacity, color, and small (4–8px) translation. Never use parallax, looping ambient animation, auto-playing video, or large scale effects.
- Use CSS `prefers-reduced-motion` universally and `gsap.matchMedia()` within GSAP components; the reduced path removes transforms/layout animation while retaining state-revealing fades.
- Skeletons match final layout and stop as soon as real data is present. Buttons use inline spinners only for local actions; generation uses the dedicated progress rail.
- Save, reorder, confidence, and regeneration states all result in an immediate optimistic response followed by a compact success/error toast with an undo affordance where safe.

## Accessibility and responsive requirements

- Target WCAG 2.2 AA: semantic HTML first, visible `:focus-visible` ring, 44px touch targets, no color-only signals, and 200% zoom without loss of action.
- Skip link targets main content; landmarks label the dock, main builder, and practice controls.
- Radix dialog/popover/menu/tabs primitives retain focus trapping, arrow navigation, escape handling, and correct ARIA behavior.
- Status changes use polite live regions; errors move focus to the summary only when a submission cannot proceed.
- All mouse interactions—drag reordering, reveal, overflow actions, tabs, confidence—have keyboard equivalents.
- At `< 640px`, use 16px page padding, stacked form fields, the bottom dock for primary navigation, and avoid horizontal card controls.

## Build order for UI

1. Install fonts and design tokens; create application shell, theme provider, icon conventions, and primitive components.
2. Implement auth/dashboard/new-kit and all loading, empty, validation, and error states before attaching real APIs.
3. Build generation room and reusable status/progress/source components.
4. Build builder cards, inline edit/reorder/regenerate interactions, then practice and schedule views.
5. Run keyboard, screen-reader, contrast, mobile, dark-theme, and reduced-motion visual QA before deployment.

## Design references and implementation provenance

- [shadcn/ui component catalogue](https://ui.shadcn.com/docs/components) and [theme tokens](https://ui.shadcn.com/docs/theming) inform the owned component architecture.
- [Radix accessibility guidance](https://www.radix-ui.com/primitives/docs/overview/accessibility) informs keyboard, focus, and ARIA behavior.
- [Motion’s reduced-motion guidance](https://motion.dev/docs/react-accessibility) informs the animation policy.
- [GSAP’s React integration](https://www.npmjs.com/package/@gsap/react) and [reduced-motion guidance](https://gsap.com/docs/v3/GSAP/gsap.matchMedia/) inform component scoping, cleanup, and accessibility.
- [GitHub’s contribution-calendar documentation](https://docs.github.com/en/account-and-profile/concepts/contributions-on-your-profile), [W3C’s grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/), [WCAG guidance on non-color cues](https://w3c.github.io/wcag/understanding/use-of-color.html), and [NN/g progress-indicator guidance](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/) inform the readiness timeline and effort graph.
- [Next.js font loading guidance](https://nextjs.org/docs/pages/getting-started/fonts) informs self-hosted font loading.
