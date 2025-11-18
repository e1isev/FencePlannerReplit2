# Fence Planner Design Guidelines

## Design Approach

**Design System: Fluent Design (Microsoft)** - Selected for its strength in productivity applications with data-dense interfaces and professional tooling aesthetics. This system excels at creating clear hierarchies and efficient workflows for technical users.

## Core Design Principles

1. **Clarity Over Decoration**: Every visual element serves a functional purpose
2. **Professional Tool Aesthetic**: Clean, technical, confidence-inspiring
3. **Immediate Feedback**: Visual confirmation for all user actions
4. **Spatial Efficiency**: Maximize canvas space while maintaining accessible controls

---

## Typography System

**Primary Font**: Inter (via Google Fonts CDN)
**Monospace Font**: JetBrains Mono (for measurements and technical data)

### Hierarchy
- **App Title/Headers**: text-lg font-semibold (18px, 600 weight)
- **Section Labels**: text-sm font-medium uppercase tracking-wide text-slate-600 (12px)
- **Body Text**: text-sm (14px, 400 weight)
- **Technical Data/Measurements**: font-mono text-sm (14px monospace)
- **Button Labels**: text-sm font-medium (14px, 500 weight)
- **Table Headers**: text-xs font-semibold uppercase (11px, 600 weight)
- **Canvas Labels**: text-xs font-medium (11px for dimension overlays)

---

## Layout System

**Spacing Scale**: Tailwind units of **2, 3, 4, 6, 8** for consistency
- Component padding: p-4 (16px) standard, p-6 (24px) for panels
- Section spacing: space-y-6 between major sections
- Inline elements: gap-2 or gap-3
- Canvas margins: m-0 (full bleed within container)

### Application Structure
```
┌─────────────────────────────────────────────┐
│  Toolbar (h-14, border-b, bg-white)         │
├────────┬────────────────────────────────────┤
│ Left   │                                    │
│ Panel  │     Canvas Stage                   │
│ w-80   │     (flex-1, bg-slate-50)         │
│ border │                                    │
│  -r    │                                    │
└────────┴────────────────────────────────────┘
```

**Left Panel**: Fixed width w-80 (320px), bg-white, border-r border-slate-200, p-6, overflow-y-auto
**Toolbar**: h-14 (56px), flex items-center justify-between px-6, border-b border-slate-200, bg-white
**Canvas Container**: flex-1, bg-slate-50 with subtle dot grid pattern
**Warnings Panel**: Sticky bottom or floating card with shadow-lg

---

## Component Library

### Navigation & Controls

**Toolbar Buttons**
- Base: px-4 h-9 rounded-md text-sm font-medium inline-flex items-center gap-2
- Primary: bg-blue-600 text-white hover:bg-blue-700
- Secondary: bg-white border border-slate-300 text-slate-700 hover:bg-slate-50
- Disabled: opacity-50 cursor-not-allowed

**Style Selector (Radio Cards)**
- Grid of cards: grid grid-cols-1 gap-3
- Each card: p-4 border-2 rounded-lg cursor-pointer transition-all
- Unselected: border-slate-200 bg-white hover:border-slate-300
- Selected: border-blue-600 bg-blue-50

**Gate Type Menu**
- Vertical button group: space-y-2
- Each option: w-full justify-start px-4 py-2.5 rounded-md border
- Icon on left, label center-left, price on right (if shown)

**Checkbox (Even Spacing)**
- Standard checkbox with label: items-center gap-2
- Checkbox: w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500

### Data Display

**Cutting List Table**
- Container: rounded-lg border border-slate-200 overflow-hidden bg-white
- Header row: bg-slate-50 border-b border-slate-200
- Cell padding: px-4 py-3
- Alternating rows: even:bg-slate-50/50
- Total row: border-t-2 border-slate-300 bg-slate-100 font-semibold
- Numeric columns: text-right font-mono

**Canvas Elements (Konva Rendering)**
- Posts: Circle radius 6px with 2px stroke
  - End: fill #10b981 (green-500), stroke #059669
  - Corner: fill #ef4444 (red-500), stroke #dc2626
  - Line: fill #3b82f6 (blue-500), stroke #2563eb
- Fence Lines: stroke #475569 (slate-600), strokeWidth 3
- Gates: fill #fbbf24 (amber-400), opacity 0.8
- Sliding Return: stroke #ef4444 (red-500), dash [8, 4], strokeWidth 2
- Dimension Labels: bg-white/90 rounded px-2 py-1 shadow-sm
- Preview Line: stroke #94a3b8 (slate-400), dash [5, 5]

### Forms & Inputs

**Text Input (Dimension Edit)**
- Input: px-3 py-2 border border-slate-300 rounded-md text-sm font-mono
- Focus: ring-2 ring-blue-500 border-blue-500
- Width: w-24 for numeric inputs

**Product Selector Tabs**
- Tab list: inline-flex gap-1 p-1 bg-slate-100 rounded-lg
- Tab: px-4 py-2 rounded-md text-sm font-medium transition-colors
- Active: bg-white shadow-sm text-slate-900
- Inactive: text-slate-600 hover:text-slate-900
- Disabled: opacity-40 cursor-not-allowed

### Overlays & Modals

**Warnings Panel (Floating Card)**
- Position: fixed bottom-6 right-6 w-96
- Style: bg-amber-50 border-l-4 border-amber-500 rounded-lg shadow-xl p-4
- Items: space-y-2, each with lucide alert-triangle icon
- Dismissible: Close button top-right

**Engineering Drawing Window**
- Full viewport: bg-white
- Drawing container: max-w-7xl mx-auto p-8
- Legend box: absolute top-8 right-8 bg-white border-2 border-slate-200 rounded-lg p-4 shadow-md
- Scale info: text-xs text-slate-500 font-mono

---

## Animations

**Minimal, Purposeful Only**
- Hover transitions: transition-colors duration-150
- Button presses: active:scale-95 transform
- Panel opening: No animation, instant display
- Canvas interactions: Konva handles internally, no CSS transitions
- Warnings appear: fade-in over 200ms only

---

## Visual Hierarchy & Color Usage

**Semantic Color Roles**
- Primary Action: blue-600 (fence style selection, primary buttons)
- Success/Confirmation: green-600 (end posts only, not for UI)
- Warning/Alert: amber-500 (warnings panel, alerts)
- Error/Critical: red-500 (corner posts, sliding returns, validation errors)
- Neutral UI: slate-50/100/200/600/700 (backgrounds, borders, text)

**Depth & Elevation**
- Canvas: Level 0 (bg-slate-50, no shadow)
- Left Panel/Toolbar: Level 1 (bg-white, border)
- Warnings Panel: Level 3 (shadow-xl)
- Tooltips: Level 4 (shadow-2xl)

---

## Responsive Behavior

**Desktop-First Application** (min-width 1280px recommended)
- Left panel remains fixed width
- Canvas scales fluidly
- Minimum viable: 1024px width

**Tablet Fallback** (768px-1024px)
- Left panel becomes collapsible drawer
- Toolbar remains fixed top
- Canvas takes full width when panel collapsed

---

## Accessibility

- All interactive elements: min h-9 (36px) touch targets
- Keyboard navigation: visible focus:ring-2 ring-blue-500
- Icon buttons: aria-label attributes required
- Form inputs: associated <label> elements
- Canvas interactions: keyboard shortcuts documented
- High contrast maintained: WCAG AA minimum
- Tooltips on all toolbar icons (via title attribute or tooltip library)