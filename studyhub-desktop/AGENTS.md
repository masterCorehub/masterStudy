# masterStudy development instructions

The production app is the source of truth. Retired Stitch and DESIGNNOVO mockups are no longer part of this repository. Preserve the established layout and behavior unless the user requests a change.

Do not automatically start long-running development servers. Builds and automated tests may run to validate changes.

Keep the visible brand masterStudy. Preserve existing storage keys, profile paths, appId, deep links and native bridge identifiers to maintain compatibility. Use the same logo source in branding/logo.svg for web and desktop assets.

Keep source, tests, deployment configuration and required runtime resources tracked. Generated builds, QA screenshots, local profiles and secrets must stay out of Git. Do not recreate the removed documentation website or design folders without a new request.

## CampusFlow visual source

### Optional Brisa theme

The user requested an optional theme inspired by their Brisa screenshot on 2026-10-06. Keep `brisa-amber` (Brisa Âmbar) selectable and persisted: espresso backgrounds, warm brown layers, cream text, peach/amber accents, subtle warm radial light, rounded cards and pill actions. These theme-specific choices override the default Deep Focus palette and radii only when Brisa Âmbar is selected; preserve CampusFlow navigation and functionality.

The existing application defines the visual baseline: compact navigation, semantic theme tokens, clear content hierarchy and responsive layouts. Preserve its behavior and data while making focused improvements.

### Today composition (2026-10-06)

The user requested a complete, denser redesign of Hoje. Use one compact surface per widget, a wide overview beside a subdued focus action, a selectable weekday agenda beside deadlines/review, tasks beside habits, and a horizontal hydration strip. Avoid oversized empty states, nested decorative cards, giant water icons, and large page gutters. Preserve real data, responsive stacking, and editable widget placement.

Today widgets use 12px padding and 8px inner gaps. Show short content fully and measure it as the minimum height; only long lists scroll (180px list viewport). Recompute after width/content changes and resolve collisions. Keep automatic height available alongside manual sizing.

macOS packaging excludes numbered duplicate files (names like `library 3.node`). On this checkout, these old copies are marked `compressed,dataless` and cause the ASAR packer to wait for unavailable content. Keep the original dependency files included; do not delete or hydrate the backup copies just to build.

### Today flow organization (2026-10-06)

The user wants a polished initial screen and secondary customization. Today uses two independent natural-height columns: overview/tasks/agenda/water in main, focus/deadlines/habits/review in side. Persist widget lane and order; do not use absolute cell positions or measured edit-toolbar height for this screen. Organization controls overlay the card border without affecting padding, height, or gaps. Drag shows an insertion line and commits before/after another widget; keyboard/buttons and column switching remain available. Preserve short-content fit and long-list scrolling. Opening, closing, and reloading organization must preserve card geometry. This supersedes the earlier Today grid/height controls guidance.

### Focused course and study workspace (2026-10-06)

The user wants Cursos e Disciplinas, Estúdio de estudo, and Fontes de conhecimento to show less information at once. Use compact library cards and one grouped Add action. Keep discipline navigation above the workspace instead of a second sidebar. The studio opens on conversation; Sources and Study tools are optional, mutually exclusive panels. On narrow screens show one panel at a time and provide an explicit close action to return to chat. Preserve source selection, search, academic records, and existing tool actions.

### Pinned notes on Today (2026-10-07)

Habits on Today also support direct width/height resizing with a corner handle, keyboard arrows and automatic-size reset. Persist appSettings.habitsPanelSize. Keep the card within its column and normal document flow. Minimum height fits the header, add form, controls and up to three complete habits measured from actual row heights; longer lists scroll. Never crop the add form or overlap following widgets.

Pinned Sticky Notes on Hoje can resize in width within their column and in height (180–800px), independently of desktop sticky-note windows. Persist each note's dashboardSize, provide a bottom-right drag handle with arrow-key resizing and a restore-size action. Keep normal column flow to prevent overlap, and scroll long note content inside the card.

### App name (2026-10-07)

Sidebar uses compact 38px navigation rows, a 232px expanded/64px compact rail, a small brand and consistent footer actions. Preserve customized order and visibility. Main macOS window uses hiddenInset native titlebar/traffic lights on the left; renderer reserves 88px and hides custom controls on macOS. Windows/Linux retain right-side controls; web has none. Sticky Notes support sanitized Markdown preview/source editing in the library, floating windows and Today, keeping raw text as the persisted content.

The user named the app masterStudy (exact casing). Use this name in visible interface text, window titles, notifications and packaged productName. Preserve studyhub-desktop package identity, com.studyhub.desktop appId, local storage keys, existing profile paths, campusflow deep links and native bridge filenames for compatibility. The current Vercel domain remains studyhub-desktop.vercel.app.

### Vault note relationships (2026-10-07)

The Vault right panel starts collapsed. Graph canvas resolution must follow its rendered box via ResizeObserver, including reopen and viewport changes; reset the pixel-ratio transform rather than accumulating scaling. Keep the canvas absolutely positioned within the graph container to avoid intrinsic canvas sizing changing layout.

Internal notes inherit parentNoteId, vaultId and academic/course context. Display children beneath their parent and provide navigation back. Recover old nested-note relations only from an unambiguous explicit embedded link; avoid cycles. Inline #tags accept accents and hierarchical tags and connect notes within the same Vault in the graph; distinguish tag connections with dashed lines. Floating Sticky Notes use one subtle CSS shadow with native transparent-window shadow disabled to avoid double contours.

### Local macOS notification delivery (2026-10-07)

Local macOS distributions need complete ad-hoc bundle signing for Electron notifications. Sign in a temporary directory outside Documents/iCloud, clear extended attributes on the generated bundle, and export a ZIP to release/masterStudy-local-arm64.zip. The hardened runtime needs disable-library-validation for bundled native modules. Notification IPC waits for show/failed and reports actual delivery; never mark failed or timed-out reminders as sent. Keep scheduler timers active in the hidden main window. Explicit notification tests request browser permission on web; automatic reminders never prompt for permission.

### Task detail theme consistency (2026-10-07)

Task details use the app's semantic surface, text, border and accent tokens in reading and editing modes. Keep long titles wrapped with a 36px desktop maximum, compact panels and themed empty states. Preserve meaningful status/error/success colors and subject accents. Pomodoro stays hidden here. In-app reminders belong at the bottom with a capped height so task header actions remain accessible.

### Apple Books inspired reader (2026-10-07)

Page turns use a brief directional perspective and shadow animation on existing page DOM, preserving selectable text and highlights. Animate PDF only after both pages finish rendering and EPUB after successful navigation. Skip initial loading, continuous scrolling, unchanged positions and reduced-motion preferences. Cancel replaced animations to avoid accumulated effects.

The user wants a complete reading experience inspired by Apple Books. Keep a stable centered paper viewport, overlay controls that fade without resizing the book, a bottom progress scrubber, mutually exclusive contents/search/appearance panels, PDF outline and lazy page thumbnails, EPUB typography and margin controls, and document-wide search with a return-to-reading action. Preserve existing annotations and theme IDs. EPUB positions are character locations: show percentage rather than presenting them as exact visual page counts. Save page and CFI together, resume automatically, and persist page one. Keep PDF layout intact, offer page/width fitting and zoom, and render sharply on Retina screens. Respect reduced motion and preserve keyboard navigation.

### Focused study improvements (2026-10-07)

Reader passage behavior: explicit two-page mode forces paginated reading and EPUB spread always, including narrower windows. Persist the choice and expose it directly in the toolbar. Saved quotations and text annotations capture EPUB CFI ranges or PDF page/rectangles and receive a standard yellow highlight. Recoloring retains highlight IDs and annotation links. Clicking annotations navigates to the exact passage; recover legacy locations from linked highlights or a unique text match, and show search choices for ambiguous matches. Clamp selection actions within the viewport and identify PDF selections from their actual text layer.

Keep independent, persisted chats per discipline. Reader controls prioritize navigation, contents, appearance and bookmarks; secondary actions belong in an overflow menu. Journal insights, filters and auxiliary actions open on demand. Group discipline materials by linked folder, class material and content type. Keep Pomodoro and Minhas Tarefas implementations but hide entry points. Classroom note titles include date and discipline/class. Internal-note references contribute incoming mentioned links within the same Vault. Capture delivery remains queued on disk until the renderer confirms persisted receipt; retries retain capture IDs. Preserve masterStudy identity and existing user data.

### Retired desktop-only Sticky Notes (2026-10-07)

The user explicitly requested removal of desktop-only placement because it caused bugs and unwanted quick notes. Remove its controls, IPC, native window mode and automatic restoration. Normalize existing desktopOnly flags to false while preserving note IDs, titles and content. Keep ordinary editable floating notes and always-on-top controls. Never recreate this feature without a new explicit request.

### Calendar, Tasks and search visibility (2026-10-08)

Book libraries support one locally linked folder with manual synchronization. Import PDF/EPUB recursively, identify files by folder ID and relative path (adopt existing native paths), and detect changes by size/mtime. Preserve edited titles, manual covers, reading positions and annotations. Missing source files are flagged, never automatically deleted. Keep the directory descriptor and web FileSystemDirectoryHandle in device-only IndexedDB; unsupported browsers reselect the folder via directory upload. Report progress and per-file failures without stopping valid imports.

Tasks use a compact list-first workspace with pending/today/overdue/completed/all filters, exclusive deadline groups and optional Kanban. Detail pages prioritize title, status/deadline, completion and subtask progress; sharing/deletion use a secondary menu. Keep semantic theme colors and readonly sharing permissions.

Reader fullscreen and page favorites are direct toolbar buttons. Heart favorites the current page/CFI; bookmark separately saves a return position. Use explicit page-specific favorite labels and dismiss appearance panels and overflow menus on outside clicks on desktop and mobile.

The user explicitly restored the Tasks screen. Show Tarefas in the sidebar and Cmd+K; this supersedes earlier instructions to hide Minhas Tarefas. Keep Pomodoro hidden. Restore existing sidebar profiles once through migration, preserving other order and visibility preferences. Today tasks include only tasks due today or completed today. Record completion date centrally for all task actions and clear it on reopening; do not infer completion from unrelated update timestamps.

The calendar uses the same responsive component across desktop and mobile, semantic theme colors, enough month rows to cover the month, and an on-demand sidebar for filters/date navigation. Task entries explicitly identify their type and completion status in all views. Preserve completed tasks in the calendar. Move only supported dated entities and write their actual persisted date fields. Cmd+K academic results use getAcademicSemesterData like the normal library: exclude archived disciplines and other semesters without deleting their content.

The macOS tray popover is compact (360 by 470), follows theme tokens, and prioritizes today's tasks, quick creation, note search and app search. Keep settings, translation/OCR and quit in an overflow menu. Do not claim synchronization without evidence. Preserve removed Pomodoro entry points as hidden.

### Compact book import and categories (2026-10-08)

Keep folder and Drive import panels behind a small + Importar action beside book status filters. Organize library records with preset and custom categories, never internal folders. Presets include Romance, Ficção, Fantasia, Mistério, Biografia, História, Ciência, Tecnologia, Filosofia and Outros. Show categories as filters. Persist custom bookCategories and each book categoryId; never erase books when removing a custom category. New imports inherit the selected category and existing books keep it on sync. Migrate legacy internal bookFolders to categories. Record manual assignment origin for future reviewable AI proposals, but do not activate AI classification yet.

### Selective background book import (2026-10-08)

Folder/Drive imports require a selectable preview. Preserve full scan separately from selected files when determining missing sources. Batch processing belongs to a single application-level controller, never a modal lifecycle; closing import UI or switching screens must not interrupt it. Show global compact progress and per-file failures. Keep one sequential batch at a time. Runtime work does not resume after application quit/reload; do not claim otherwise. If the target custom category is deleted mid-job, save new books without a category.
