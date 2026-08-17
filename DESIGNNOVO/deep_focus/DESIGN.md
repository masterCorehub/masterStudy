---
name: Deep Focus
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45474c'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#061525'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b2a3b'
  on-tertiary-container: '#8291a6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#d4e4fa'
  tertiary-fixed-dim: '#b9c8de'
  on-tertiary-fixed: '#0d1c2d'
  on-tertiary-fixed-variant: '#39485a'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  surface-alt: '#E8EAF0'
  border-subtle: '#E2E8F0'
  text-high-contrast: '#0F172A'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  margin-page: 64px
  gutter: 24px
  section-gap: 80px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The design system is engineered for cognitive clarity and academic discipline. It embodies a **Minimalist** aesthetic that prioritizes the "Deep Focus" required for intensive study. By removing decorative distractions, the interface becomes an invisible tool, fostering a professional and stoic environment for high-level productivity.

The visual narrative is defined by:
- **Extreme Minimalism:** A "less is more" approach where every pixel must earn its place.
- **Architectural Whitespace:** Large, intentional gaps between content blocks to prevent cognitive overload.
- **Technical Precision:** Geometric lines and a rigid adherence to the layout grid create a sense of order and authority.
- **Academic Stoicism:** A cold but clear personality that mimics the focus of a physical library or a high-end laboratory.

## Colors

The palette is strictly controlled to maintain a calm, authoritative atmosphere. 

- **Primary Action:** Deep Blue (#1E293B) is reserved for the most critical actions and primary brand touchpoints, signaling authority and focus.
- **Surface Strategy:** The background uses a near-white neutral (#F8FAFC), while containers and secondary surfaces leverage a slightly cooler slate (#E8EAF0) to provide subtle differentiation without heavy shadows.
- **Contrast:** High-contrast text (#0F172A) is used for all body and heading content to ensure maximum legibility and technical clarity. 
- **Functional Grays:** Slate tones are used for borders, secondary icons, and de-emphasized metadata.

## Typography

This design system utilizes **Inter** exclusively to achieve technical clarity and a systematic feel. 

- **Hierarchy:** Dramatic scale shifts between headers and body text provide immediate information hierarchy. 
- **Readability:** Line heights are generous (1.6 for body) to facilitate long-form reading and data scanning.
- **Technical Labels:** Small labels utilize increased letter-spacing and uppercase styling to denote metadata, categories, and system-level information, distinguishing them from user-generated content.
- **Mobile Adaptation:** Headlines larger than 24px should scale down by 20% on mobile devices while maintaining line-height ratios.

## Layout & Spacing

The layout philosophy centers on a **Fixed Grid** on desktop and a **Fluid Grid** on mobile to ensure a high density of whitespace remains consistent across all viewports.

- **Grid Model:** Use a 12-column grid for desktop with 64px outer margins and 24px gutters. Elements should rarely be crowded; horizontal "breathing room" is mandatory.
- **Rhythm:** An 8px base unit governs all dimensions. Vertical spacing between distinct sections (e.g., Dashboard "Today" view to "Kanban") should be expansive (80px+) to visually isolate tasks and reduce noise.
- **Density:** While text is high-contrast and sharp, the spacing around it is "loose." This prevents the interface from feeling cramped or "data-heavy," even when presenting complex academic schedules.

## Elevation & Depth

To maintain the minimalist and geometric focus, this design system rejects traditional shadows in favor of **Tonal Layers and Low-Contrast Outlines**.

- **Surface Tiers:** Depth is communicated through color shifts. The base level is #F8FAFC. Secondary containers (cards, sidebars) use #E8EAF0. 
- **Borders:** Instead of shadows, use 1px solid borders in #E2E8F0 to define boundaries. This creates a "blueprint" feel that aligns with the technical clarity of the brand.
- **Zero Elevation:** Interactive elements do not "lift" off the page. Instead, they respond to interaction through subtle color shifts (e.g., darkening the background) or stroke weight changes.

## Shapes

The shape language is strictly **Geometric and Subdued**. 

- **Radius:** A small corner radius (4px to 8px) is applied to all components. This is enough to prevent the UI from feeling aggressive, but sharp enough to maintain a serious, professional academic vibe.
- **Consistency:** All containers, buttons, and input fields must share the same `rounded-md` (4px) or `rounded-lg` (8px) values to ensure a unified systematic appearance.

## Components

### Buttons
- **Primary:** Solid Deep Blue (#1E293B) with high-contrast white text. No shadow. 4px roundedness.
- **Secondary:** Ghost style. No background, Slate border (#64748B), and Slate text.
- **Interaction:** On hover, primary buttons shift to a slightly darker shade; ghost buttons fill with a very light gray (#F1F5F9).

### Input Fields
- **Design:** Minimalist underline or 1px border. Background matches the surface it sits on. No heavy "inset" shadows.
- **Focus State:** 2px border in Deep Blue. No "glow" or blur effects.

### Cards & Kanban
- **Structure:** Cards use the #E8EAF0 background to distinguish themselves from the page. Borders are sharp and clean.
- **Information Density:** Content within cards should have significant internal padding (at least 24px) to promote focus on the specific task.

### Academic Indicators
- **Pomodoro Timer:** A clean, large-digit countdown using `display-lg`. No decorative rings—just the numbers and a simple progress bar.
- **Impact Analysis:** Use high-contrast line graphs with 2px strokes. Avoid gradients or area fills to keep the technical clarity intact.
- **Discipline Coding:** While specific discipline colors may be used, they should be applied as subtle 4px vertical "accent bars" on the side of cards rather than coloring the entire component.