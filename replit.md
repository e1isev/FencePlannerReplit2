# Fence and Decking Planner

## Overview

A comprehensive browser-based fence and decking planner application that enables users to design fence layouts and deck designs using an interactive canvas.

**Fence Planner**: Draw fence lines with smart snapping, place gates, select fence styles, and receive real-time cost estimates. Features pan/zoom navigation, automated panel fitting, post categorization, and warnings for design issues like insufficient sliding gate return space.

**Decking Planner**: Draw deck shapes (rectangles, semicircles) with adjustable dimensions, visualize 140mm boards with 3mm gaps, toggle board direction, select from 8 deck color options, and generate cutting lists. Features right-click panning, on-canvas dimension editing, and shape snapping.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (November 18, 2025)

### Decking Planner Updates
- **Navigation**: Added functional "Decking" button in Product Category section that navigates from fence planner to decking planner
- **Shape Selection**: Removed square shape option, now only rectangle and semicircle available
- **Right-Click Panning**: Implemented right-click to pan functionality that works from anywhere on canvas (empty space or shapes)
- **Dynamic Shape Colors**: Shapes now preview in selected deck color instead of hardcoded blue
- **On-Canvas Dimension Editing**: Added clickable dimension labels with inline editing modal matching fence planner UX

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript and Vite for fast development builds and hot module replacement.

**State Management**: Zustand with persistence middleware for application state. Two separate stores:
- `appStore.ts`: Manages fence planning state including lines, posts, gates, panels, and undo/redo history
- `deckingStore.ts`: Manages decking state including shapes, boards, selected color, and board direction

**Canvas Rendering**: Konva.js (react-konva) for high-performance 2D canvas rendering, supporting interactive drawing, zooming, panning, and real-time preview of fence and deck elements.

**Coordinate System**: All geometry stored in millimeters, converted to pixels only for rendering. SCALE_FACTOR of 10 (pixels to mm conversion). Stage transforms (scale, pan) are reversed during drag operations to maintain mm-only state invariant.

**UI Components**: Shadcn/ui component library built on Radix UI primitives, providing accessible and customizable components. Design follows Microsoft Fluent Design principles emphasizing clarity and professional aesthetics.

**Styling**: Tailwind CSS with custom design tokens for consistent spacing, colors, and typography. Uses Inter font for UI and JetBrains Mono for technical measurements.

**Routing**: Wouter for lightweight client-side routing between fence planner (`/`), decking planner (`/decking`), and drawing export views.

**Data Validation**: Zod schemas for runtime type checking and validation.

### Core Application Logic

**Fence Geometry Engine**: Custom geometry modules handle:
- Point snapping to existing fence endpoints (12px tolerance)
- 90-degree angle enforcement for orthogonal fence runs
- Post categorization (end, corner, line) based on connection angles
- Panel fitting with support for even spacing and leftover material tracking
- Gate placement validation including sliding gate return space requirements

**Decking Geometry Engine**: Custom geometry modules handle:
- Shape placement and dimension management (rectangles, semicircles)
- Board visualization with 140mm width and 3mm gaps
- Maximum board length enforcement (5400mm)
- Board direction toggling (0° or 90°)
- Shape overlap detection
- Adjacent shape snapping

**Pricing System**: Real-time cost calculation based on selected fence style, counting panels (excluding leftovers), posts by category, and gates by type. Pricing data loaded from JSON configuration.

**Warning System**: Validates design constraints and displays warnings for issues like insufficient sliding gate return space.

**History Management**: Undo/redo functionality tracking state snapshots of lines, gates, panels, and leftovers.

### Data Models

**Fence Planning Entities**:
- `FenceLine`: Represents a fence run with start/end points, length, and spacing preferences
- `Post`: Auto-generated posts categorized as end, corner, or line posts
- `Gate`: Gate placements with type-specific dimensions (single/double 900mm/1800mm, sliding 4800mm)
- `PanelSegment`: Individual fence panels with material usage tracking
- `Leftover`: Tracks reusable cut panel pieces

**Decking Planning Entities**:
- `DeckShape`: Represents deck shapes (rectangle, semicircle) with position, dimensions, and unique ID
- `Board`: Individual decking boards with position, length, and cut information
- `DeckColor`: 8 color options (Storm Granite, Mallee Bark, Ironbark Ember, Saltbush Veil, Outback, Coastal Spiniflex, Wild Shore, Coastal Sandstone)

**Type System**: Strong TypeScript typing with discriminated unions for product kinds, fence styles, gate types, deck shapes, and colors.

### Page Structure

**Fence Planner Page (`/`)**: Main workspace with three zones:
- Left panel (320px fixed width) for controls, style selection, and cost breakdown
- Top toolbar for undo/redo, clear, and navigation to drawing view
- Canvas stage (flex-grow) for interactive fence design

**Decking Planner Page (`/decking`)**: Main workspace with three zones:
- Left panel (320px fixed width) for shape selection, color picker, and board direction toggle
- Top toolbar for undo/redo, clear, and navigation
- Canvas stage (flex-grow) for interactive deck design with right-click panning and on-canvas dimension editing

**Drawing Page**: Export view showing the complete fence layout scaled to fit canvas with measurements and styling appropriate for printing/sharing.

### Backend Architecture

**Server Framework**: Express.js with TypeScript serving both API routes and static frontend assets.

**Development Setup**: Vite middleware integration for hot module replacement during development. Production builds serve pre-compiled static assets.

**Storage Interface**: Abstracted storage layer (`IStorage`) with in-memory implementation for user data. Designed to be swappable with database-backed storage.

**Session Management**: Placeholder for session handling using connect-pg-simple (PostgreSQL session store).

## External Dependencies

### Database

**ORM**: Drizzle ORM configured for PostgreSQL with schema definitions in `shared/schema.ts`.

**Provider**: Neon serverless PostgreSQL driver (`@neondatabase/serverless`).

**Migrations**: Drizzle Kit for schema migrations with output to `./migrations` directory.

**Note**: Database integration is scaffolded but not actively used in current fence planning features. User and session tables defined but application primarily operates client-side with local state.

### Third-Party Services

**None**: Application is fully self-contained with no external API dependencies. All pricing data, geometry calculations, and state management occur client-side.

### UI Libraries

**Component Library**: Radix UI primitives for accessible, unstyled component foundations.

**Styling Framework**: Tailwind CSS with PostCSS for utility-first styling.

**Icons**: Lucide React for consistent iconography.

### Development Tools

**Build Tool**: Vite with React plugin and custom Replit plugins for error overlay, cartographer, and dev banner in development mode.

**Type Checking**: TypeScript with strict mode enabled, path aliases for clean imports (`@/`, `@shared/`, `@assets/`).

**Code Quality**: ESLint configuration (referenced but not included in repository).
