# Virtual Office

A dedicated page with a visual company office where agents sit at desks.

## Data Model

### Table `offices`

```
offices:
  id          uuid PK
  company_id  uuid FK → companies (unique — one office per company)
  name        text        — e.g. "Main Office"
  map_data    jsonb       — full Tiled JSON (map, layers, tiles, object layer)
  created_at  timestamp
  updated_at  timestamp
```

### Table `office_seats`

```
office_seats:
  id          uuid PK
  office_id   uuid FK → offices
  agent_id    uuid FK → agents
  seat_id     text        — matches Tiled object name (e.g. "seat-1")
  char_sprite text        — e.g. "char_03_idle.png"
  created_at  timestamp
```

Seats are a separate table (not JSONB), one row per assignment.

### Object Layer in Tiled Map

Interactive elements are defined via the Tiled object layer (stored inside map_data):

| type          | Purpose              | Properties             |
|---------------|----------------------|------------------------|
| seat          | Desk/workstation     | direction (always down)|
| record_player | Vinyl record player  | —                      |

13 seats total across 4 desk rows. All agents face down.

## Assets

```
ui/public/office/
├── characters/           — agent sprites (32x64px, ~600 bytes each)
│   ├── char_01_idle.png
│   └── ... (13 total)
├── tilesets/              — tileset images (referenced by map_data)
│   ├── floors-32x32.png
│   ├── walls-32x32.png
│   ├── generic-32x32.png
│   ├── living-room-32x32.png
│   ├── classroom-32x32.png
│   ├── conference-32x32.png
│   ├── furniture-state1-16x16.png
│   ├── furniture-state2-16x16.png
│   └── small-items-16x16.png
└── office.json            — default map template (seed for new offices)
```

`office.json` is a seed file. On office creation it gets loaded into `map_data` in the database. After that, the renderer reads from API, not from file.

## Rendering

- Canvas draws tile layers from map_data; only re-renders via rAF when agents are running (idle = single frame)
- Layer order: Floor → Walls → Windows → Flowers → **Agents (sprites)** → Furniture → Fruits → Pillows
- Agents render under the furniture layer — appear to sit behind desks
- Running agents have a fast bob animation; idle agents are static
- HTML overlays on top of canvas: agent name, status dot, speech bubbles, tooltips

### Agent Overlays

Each seated agent has:
- **PixelDot** — status indicator (ping=running, bounce=error, none=idle)
- **Name label** — pixel font with stroke outline
- **Speech bubble** — shows current work (running) or error message (error status)
- **Tooltip on hover** — agent info: name, status, role, provider, model (+ reasoning effort), monthly spend, last activity with timestamp. Uses InlineMarkdown for text rendering.
- **Right-click** — opens sprite picker (change character) + "Remove from office" action. Tooltip hides while editing.

### Vacant Seats

Vacant seats show a dashed green outline on hover. Clicking opens a two-step popover:
1. Pick an agent (from unseated agents list)
2. Pick a character sprite (head-only preview, 13 options)

## Music (Record Player)

- Record player position defined in map_data object layer
- Singleton module `ui/src/lib/office-audio.ts` manages audio state and DOM element
- Audio element attached to `document.body` (outside React tree) — persists across page navigation
- Office page: click record player to play/pause, cycle stations (lofi, synthwave, jazz)
- Header: `<OfficeRadio />` mini-control (play/pause, station name) — imports same singleton
- Stations hardcoded in the singleton module

## Backend (extension)

New files only, no modifications to existing logic or tables:

- `packages/db/src/office/schema.ts` — office + office_seats table schemas
- `server/src/services/office.ts` — service layer
- `server/src/routes/office.ts` — API endpoints

Minimal upstream touch points:
- `server/src/app.ts` — +1 line (mount route)
- `server/src/services/index.ts` — +1 line (export)

### API Endpoints

- `GET /companies/:companyId/office` — get office with seats
- `POST /companies/:companyId/office` — create office (with default map)
- `PATCH /companies/:companyId/office` — update map_data or name
- `PUT /companies/:companyId/office/seats/:agentId` — assign/reassign seat (body: `{seatId, charSprite}`)
- `DELETE /companies/:companyId/office/seats/:agentId` — unassign seat

## Frontend

New files:
- `ui/src/pages/Office.tsx` — page component (data fetching, derived state)
- `ui/src/components/office/TileMapCanvas.tsx` — canvas tilemap renderer with bob animation
- `ui/src/components/office/AgentOverlay.tsx` — agent positioning + right-click edit state
- `ui/src/components/office/AgentTooltip.tsx` — hover tooltip (info) / edit mode (sprite picker + remove)
- `ui/src/components/office/SpeechBubble.tsx` — speech bubble (default + error variant)
- `ui/src/components/office/InlineMarkdown.tsx` — lightweight markdown for compact contexts
- `ui/src/components/office/SpritePicker.tsx` — character sprite grid (head-only crop)
- `ui/src/components/office/PixelDot.tsx` — status dot with ping/bounce/pulse animations
- `ui/src/components/office/VacantSeatOverlay.tsx` — vacant seat assignment (agent → sprite two-step)
- `ui/src/components/office/RadioPlayer.tsx` — record player overlay (click to play)
- `ui/src/components/office/OfficeRadio.tsx` — mini header control (play/pause, station)
- `ui/src/components/office/agent-colors.ts` — status → dot color mapping
- `ui/src/components/office/types.ts` — Tiled map type definitions
- `ui/src/lib/office-audio.ts` — singleton audio manager
- `ui/src/api/office.ts` — API client (`assignSeat`, `unassignSeat`)

Minimal upstream touch points:
- `ui/src/App.tsx` — +1 route
- `ui/src/components/Sidebar.tsx` — +1 nav item
- `ui/src/components/Layout.tsx` — +1 component `<OfficeRadio />` in header
- `ui/src/lib/queryKeys.ts` — +1 query key
- `server/src/routes/agents.ts` — +2 columns in live-runs endpoint (error, errorCode)
- `ui/src/api/heartbeats.ts` — +2 fields in LiveRunForIssue type
- `ui/src/components/LiveRunWidget.tsx` — +2 fields in LiveRunForIssue construction

## Done

- [x] Data model (offices table + office_seats table with Drizzle)
- [x] Backend API (CRUD office, assign/unassign seats)
- [x] Tiled map canvas renderer with layer ordering
- [x] Agent sprites with bob animation (fast bob for running, static for idle)
- [x] Canvas performance: rAF stops when no running agents
- [x] Agent overlays: name labels, status dots, speech bubbles
- [x] Speech bubbles: current work (running) + real error messages (error) + live activity via WS
- [x] Agent tooltips: status, role, provider, model + reasoning effort, spend, last activity
- [x] InlineMarkdown rendering in tooltips and bubbles
- [x] Right-click context menu: sprite picker + remove from office
- [x] Vacant seat assignment: two-step popover (agent → character)
- [x] Sprite picker with head-only crop
- [x] Record player + radio with persistent audio across navigation (9 stations)
- [x] Sidebar nav + route

## TODO

- [ ] Drag & drop agents between seats
- [ ] Edit mode toggle for office management
- [ ] Walking animation when agent moves between seats
- [ ] Custom map editor / map selection
