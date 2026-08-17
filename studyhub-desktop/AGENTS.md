# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Do NOT automatically run the local development server (e.g. `npm run dev` or equivalent executable commands) after making code changes. However, you MAY automatically run build processes (e.g. `npm run build`) to verify that the code compiles correctly. Wait for explicit user instruction before starting any long-running local servers.

## CampusFlow visual source

The durable and absolute visual source for the application is `/home/ale/Downloads/StudyHub/DESIGNNOVO`, especially `deep_focus/DESIGN.md` and each desktop/mobile `screen.png`. Rebuild the visible layouts to match those references instead of preserving the previous StudyHub composition. Reuse working StudyHub logic and persistence behind the new screens, keep the legacy implementation files available, and omit prototype-only features that do not have real support. Use the CampusFlow name, Inter typography, Deep Focus navy/neutral palette, compact 4–8px radii, tonal layers, thin borders, and low visual noise.
