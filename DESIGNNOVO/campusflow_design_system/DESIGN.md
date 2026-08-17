---
name: CampusFlow Design System
colors:
  surface: '#fbf8ff'
  surface-dim: '#d8d8ed'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2ff'
  surface-container: '#edecff'
  surface-container-high: '#e6e6fc'
  surface-container-highest: '#e1e1f6'
  on-surface: '#181b2a'
  on-surface-variant: '#494454'
  inverse-surface: '#2d2f3f'
  inverse-on-surface: '#f0efff'
  outline: '#7b7486'
  outline-variant: '#cbc3d7'
  surface-tint: '#6d3bd7'
  primary: '#6b38d4'
  on-primary: '#ffffff'
  primary-container: '#8455ef'
  on-primary-container: '#fffbff'
  inverse-primary: '#d0bcff'
  secondary: '#006e2d'
  on-secondary: '#ffffff'
  secondary-container: '#7cf994'
  on-secondary-container: '#007230'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#7ffc97'
  secondary-fixed-dim: '#62df7d'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005320'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#fbf8ff'
  on-background: '#181b2a'
  surface-variant: '#e1e1f6'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is anchored in the concept of "Cognitive Clarity." It is built for students and educators who manage high-density information and require an environment that reduces mental load rather than increasing it. The brand personality is modern, scholarly yet accessible, and deeply organized.

This design system utilizes a **Modern Minimalist** style with **Soft UI** influences. It avoids unnecessary ornamentation, favoring generous white space and high-quality typography to create a sense of breathability. The emotional response should be one of "effortless control"—transforming the potential chaos of academic life into a structured, calm, and welcoming digital workspace.

## Colors

The color strategy focuses on functional signaling and hierarchy. 
- **Primary Violet (#8B5CF6)** is used for brand presence, primary actions, and active navigational states.
- **Semantic Colors** (Green, Red, Amber) are reserved strictly for status communication: success/completion, errors/deadlines, and warnings/pending items.
- **Surface Neutrals** are slightly cooled to reduce eye strain during long study sessions. The background uses a soft off-white/gray to separate it from pure white content cards, creating a natural layering effect without heavy shadows.
- **Typography** uses a high-contrast charcoal for primary headings and a muted slate for secondary metadata to ensure a clear information hierarchy.

## Typography

The design system exclusively uses **Inter** to leverage its exceptional legibility and systematic feel. 
- **Headlines:** Use tighter letter-spacing and semi-bold weights to create a strong "anchor" for page sections.
- **Body Text:** Optimized for long-form reading with a generous line height (1.5x) to prevent fatigue.
- **Labels:** Small caps or increased letter spacing should be used for category labels and table headers to distinguish them from interactive text.
- **Mobile Scaling:** Headlines scale down on mobile to maintain vertical density, while body text remains at 16px to ensure accessibility.

## Layout & Spacing

This design system follows an **8px linear scale** to maintain rhythmic consistency. 

- **Layout Model:** A fluid grid is used for the dashboard views, allowing cards to reflow based on screen width. 
- **Sidebars:** The navigation sidebar is fixed at 280px on desktop and collapses into a bottom bar or hamburger menu on mobile.
- **Gaps:** Use `16px` (md) for spacing between related elements in a group and `24px` (lg) for spacing between major sections or cards.
- **Margins:** Desktop views should maintain a `40px` outer margin to prevent the content from feeling cramped against the screen edges, reinforcing the minimalist aesthetic.

## Elevation & Depth

To maintain a "flat-modern" aesthetic, depth is created primarily through **Tonal Layers** rather than heavy shadows.

- **Level 0 (Background):** The base surface (#E8EAF0) is the furthest back.
- **Level 1 (Cards/Sidebar):** Pure white (#FFFFFF) surfaces with a very soft, diffused shadow (0px 4px 12px rgba(46, 48, 64, 0.05)).
- **Level 2 (Dropdowns/Modals):** Elements that sit above the UI use a more defined shadow (0px 8px 24px rgba(46, 48, 64, 0.12)) and a 1px border using the background color to provide crisp definition.
- **Interaction:** Hover states on cards should slightly lift the element by increasing the shadow spread, providing a tactile sense of responsiveness.

## Shapes

The design system uses a **Rounded** shape language to appear friendly and modern. 
- **Standard Elements:** Buttons, input fields, and small cards use a `0.5rem` (8px) radius.
- **Large Containers:** Dashboard widgets and main content areas use `1rem` (16px) to emphasize the "contained" and organized nature of the software.
- **Pills:** Status indicators (Chips) and the Pomodoro timer should use a full pill radius to differentiate them from actionable containers.

## Components

- **Sidebar Navigation:** Use active state indicators with a 4px vertical bar in the Primary color on the left edge. Icons should be "Outlined" style for a lighter visual weight.
- **Task Cards:** Include a checkbox, task title (Title-LG), and a footer area for "Due Date" and "Category Tags." Use a subtle transition on hover.
- **Progress Bars:** Use a 8px height with a rounded track. The fill should use Primary or Success colors based on the context.
- **Pomodoro Timer:** A large, centered display using Display-LG typography. Use a circular progress ring to visualize time remaining.
- **Grade Tables:** Use a clean, borderless approach with alternating row highlights (Zebra striping) using the Surface color at 50% opacity.
- **Input Fields:** Use a 1px border (#D1D5DB) that shifts to the Primary color on focus. Labels should always be visible above the field (never just placeholders).
- **Buttons:** Primary buttons use a solid Violet fill with white text. Secondary buttons use a Violet outline or a subtle gray ghost style.