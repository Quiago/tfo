# Workflow Builder

## Purpose

Responsive industrial workflow builder with dual-mode interface:
- **Desktop (>=768px):** React Flow canvas + node palette sidebar + config panel + voice/text input
- **Mobile (<768px):** Sequential card view + voice/text input + confirmation cards

Core concept: Technician speaks or types a workflow description -> AI parses into structured intent -> User confirms via cards -> Workflow is created with executable nodes.

## Architecture

```
WorkflowBuilder (main wrapper, responsive mode switch)
├── WorkflowToolbar (top bar: title, mode toggle, export, run)
├── NodePalette (desktop: draggable node categories sidebar)
├── WorkflowCanvas (desktop: React Flow canvas with OpsFlowNode)
│   └── OpsFlowNode (custom node component with typed handles)
├── WorkflowCardView (mobile: sequential step cards)
├── VoiceInput (floating mic + text input, always visible)
├── NodeConfigPanel (desktop: right sidebar for node properties)
└── ConfirmationCardOverlay (modal: AI-generated workflow review)
```

## Data Flow

```
Voice/Text Input
  -> AI Intent Parsing (simulated in mock, LLM in production)
  -> VoiceWorkflowIntent (structured JSON)
  -> ConfirmationCard (user reviews)
  -> confirmWorkflowIntent() -> converts to WorkflowNodes + Edges
  -> Rendered in Canvas (desktop) or CardView (mobile)
```

## Key Types

### WorkflowNode
```typescript
interface WorkflowNode {
  id: string
  type: WorkflowNodeType    // 'voice_trigger' | 'decision' | 'create_ticket' | ...
  label: string
  config: NodeConfig         // Type-specific payload
  position: { x: number; y: number }
}
```

### VoiceWorkflowIntent (AI output)
```typescript
interface VoiceWorkflowIntent {
  title: string
  description: string
  targetAsset?: TargetAsset
  trigger: { type: WorkflowNodeType; keywords?: string[] }
  steps: { type: WorkflowNodeType; label: string; config: NodeConfig }[]
  safetyCheck?: SafetyCheck
}
```

## Node Registry

19 node types across 5 categories:
- **Triggers** (4): voice_trigger, manual_trigger, sensor_trigger, schedule_trigger
- **Conditions** (2): decision (IF/THEN/ELSE), checklist_gate
- **Inputs** (4): voice_input, photo_input, text_input, number_input
- **Actions** (5): create_ticket, send_alert, log_entry, generate_report, update_sheet
- **Utility** (4): timer_wait, ai_suggest, sub_workflow, note

Each node has `availableIn: ['free' | 'pro' | 'enterprise']` for freemium gating.

## Store (Zustand)

`useWorkflowStore` manages all state via immer:
- Workflow CRUD (create, load, update meta)
- Node CRUD (add, update, remove, select) -- supports drag-from-palette
- Edge CRUD (add, remove, connect)
- Voice state (recording, transcript, confirmation card)
- Execution state (running, log)
- Mode switching (canvas <-> cards)

## Drag & Drop (Desktop)

1. NodePalette sets `dataTransfer` with node type on drag start
2. WorkflowCanvas handles `onDrop` -> reads type -> calls `addNode(type, position)`
3. React Flow renders new OpsFlowNode at drop position

## Voice -> Workflow Flow (Mobile)

1. User taps mic -> VoiceInput shows recording state
2. User stops -> simulated AI processing delay
3. AI returns `VoiceWorkflowIntent` -> ConfirmationCardOverlay opens
4. User reviews steps as cards -> taps "Activate"
5. `confirmWorkflowIntent()` converts intent to nodes + edges
6. Workflow renders in CardView

## Mock Data

`useWorkflowMockData()` provides:
- `MOCK_WORKFLOW_VIBRATION`: Bosch pump diagnosis with decision branch
- `MOCK_WORKFLOW_RACK_INSPECTION`: Dell server PSU workflow
- `MOCK_VOICE_INTENT`: HVAC compressor AI output

## Dependencies

- `reactflow` -- Canvas engine
- `zustand` + `immer` -- State management
- `lucide-react` -- Icons
- `zod` -- Validation (see `/lib/validators/workflow.validators.ts`)

## Files

```
/components/features/workflow-builder/
  WorkflowBuilder.tsx        -- Main responsive wrapper
  WorkflowCanvas.tsx         -- React Flow canvas (desktop)
  WorkflowCardView.tsx       -- Sequential cards (mobile)
  WorkflowToolbar.tsx        -- Top bar
  NodePalette.tsx            -- Draggable nodes sidebar
  NodeConfigPanel.tsx        -- Node property editor
  OpsFlowNode.tsx            -- Custom React Flow node
  VoiceInput.tsx             -- Mic + text input
  ConfirmationCardOverlay.tsx -- AI intent review modal
  index.ts                   -- Barrel export

/lib/types/workflow.ts       -- All TypeScript interfaces
/lib/validators/workflow.validators.ts -- Zod schemas
/lib/store/workflow-store.ts -- Zustand store
/lib/hooks/useWorkflowMockData.ts -- Mock data
/lib/hooks/useMediaQuery.ts  -- Responsive breakpoint hook

/app/playground/workflow-builder/page.tsx -- Playground
```
