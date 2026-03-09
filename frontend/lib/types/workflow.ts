// /lib/types/workflow.ts
// Core type system for OpsFlow — Industrial Workflow Engine
// Designed to be JSON-serializable, portable, and forkable

// ─── Node Categories ─────────────────────────────────────────────
export type NodeCategory = 'trigger' | 'condition' | 'action' | 'input' | 'output' | 'utility'

// ─── Node Types (Industrial-Specific) ────────────────────────────
export type WorkflowNodeType =
  // Triggers
  | 'voice_trigger'      // Activated by voice command / keywords
  | 'manual_trigger'     // User presses "Run"
  | 'sensor_trigger'     // IoT sensor threshold (future)
  | 'schedule_trigger'   // Cron-style schedule (future)
  // Conditions
  | 'decision'           // IF/THEN/ELSE branch
  | 'checklist_gate'     // All items must be checked to proceed
  // Inputs
  | 'voice_input'        // Capture voice note
  | 'photo_input'        // Capture photo evidence
  | 'text_input'         // Manual text entry
  | 'number_input'       // Numeric measurement entry
  // Actions
  | 'create_ticket'      // Create ticket in Jira/ServiceNow/etc
  | 'send_alert'         // Send notification (Slack/Email/Telegram)
  | 'log_entry'          // Write to maintenance log
  | 'generate_report'    // Export PDF/Excel report
  | 'update_sheet'       // Write row to Google Sheets/Excel
  // Utility
  | 'timer_wait'         // Wait for X duration
  | 'ai_suggest'         // Ask LLM for diagnosis
  | 'sub_workflow'       // Reference another workflow
  | 'note'               // Annotation node (no execution)

// ─── Node Metadata (for rendering & palette) ────────────────────
export interface NodeMeta {
  type: WorkflowNodeType
  category: NodeCategory
  label: string
  icon: string          // Lucide icon name
  color: string         // Tailwind color class stem (e.g. 'amber', 'emerald')
  description: string
  availableIn: ('free' | 'pro' | 'enterprise')[]
}

export const NODE_REGISTRY: Record<WorkflowNodeType, NodeMeta> = {
  // Triggers
  voice_trigger:    { type: 'voice_trigger',    category: 'trigger',   label: 'Voice Trigger',     icon: 'Mic',           color: 'rose',    description: 'Activate by voice command or keywords',   availableIn: ['free', 'pro', 'enterprise'] },
  manual_trigger:   { type: 'manual_trigger',   category: 'trigger',   label: 'Manual Start',      icon: 'Play',          color: 'rose',    description: 'Run workflow manually',                   availableIn: ['free', 'pro', 'enterprise'] },
  sensor_trigger:   { type: 'sensor_trigger',   category: 'trigger',   label: 'Sensor Trigger',    icon: 'Activity',      color: 'rose',    description: 'Trigger when sensor threshold is crossed', availableIn: ['enterprise'] },
  schedule_trigger: { type: 'schedule_trigger',  category: 'trigger',   label: 'Schedule',          icon: 'Clock',         color: 'rose',    description: 'Run on a schedule',                       availableIn: ['pro', 'enterprise'] },
  // Conditions
  decision:         { type: 'decision',         category: 'condition', label: 'Decision',          icon: 'GitBranch',     color: 'violet',  description: 'IF condition THEN path A ELSE path B',     availableIn: ['free', 'pro', 'enterprise'] },
  checklist_gate:   { type: 'checklist_gate',   category: 'condition', label: 'Checklist Gate',    icon: 'ListChecks',    color: 'violet',  description: 'All items must be verified to proceed',    availableIn: ['free', 'pro', 'enterprise'] },
  // Inputs
  voice_input:      { type: 'voice_input',      category: 'input',     label: 'Voice Note',        icon: 'MicVocal',      color: 'sky',     description: 'Record a voice observation',               availableIn: ['free', 'pro', 'enterprise'] },
  photo_input:      { type: 'photo_input',       category: 'input',     label: 'Photo Capture',     icon: 'Camera',        color: 'sky',     description: 'Take a photo as evidence',                 availableIn: ['free', 'pro', 'enterprise'] },
  text_input:       { type: 'text_input',        category: 'input',     label: 'Text Input',        icon: 'TextCursorInput', color: 'sky',   description: 'Enter text manually',                      availableIn: ['free', 'pro', 'enterprise'] },
  number_input:     { type: 'number_input',      category: 'input',     label: 'Measurement',       icon: 'Gauge',         color: 'sky',     description: 'Enter a numeric measurement',              availableIn: ['free', 'pro', 'enterprise'] },
  // Actions
  create_ticket:    { type: 'create_ticket',    category: 'action',    label: 'Create Ticket',     icon: 'TicketPlus',    color: 'amber',   description: 'Create ticket in Jira, ServiceNow, etc',  availableIn: ['pro', 'enterprise'] },
  send_alert:       { type: 'send_alert',       category: 'action',    label: 'Send Alert',        icon: 'Bell',          color: 'amber',   description: 'Notify via Slack, Email, or Telegram',    availableIn: ['free', 'pro', 'enterprise'] },
  log_entry:        { type: 'log_entry',        category: 'action',    label: 'Log Entry',         icon: 'FileText',      color: 'amber',   description: 'Write to maintenance log',                 availableIn: ['free', 'pro', 'enterprise'] },
  generate_report:  { type: 'generate_report',  category: 'action',    label: 'Generate Report',   icon: 'FileSpreadsheet', color: 'amber', description: 'Export a PDF or Excel report',             availableIn: ['pro', 'enterprise'] },
  update_sheet:     { type: 'update_sheet',     category: 'action',    label: 'Update Sheet',      icon: 'Sheet',         color: 'amber',   description: 'Write a row to Google Sheets',            availableIn: ['free', 'pro', 'enterprise'] },
  // Utility
  timer_wait:       { type: 'timer_wait',       category: 'utility',   label: 'Wait / Timer',      icon: 'Timer',         color: 'slate',   description: 'Wait for a specified duration',            availableIn: ['free', 'pro', 'enterprise'] },
  ai_suggest:       { type: 'ai_suggest',       category: 'utility',   label: 'AI Diagnosis',      icon: 'BrainCircuit',  color: 'emerald', description: 'Ask AI for diagnosis or suggestion',      availableIn: ['pro', 'enterprise'] },
  sub_workflow:     { type: 'sub_workflow',      category: 'utility',   label: 'Sub-Workflow',      icon: 'Workflow',      color: 'slate',   description: 'Run another workflow as a step',          availableIn: ['pro', 'enterprise'] },
  note:             { type: 'note',             category: 'utility',   label: 'Note',              icon: 'StickyNote',    color: 'slate',   description: 'Add a comment or annotation',              availableIn: ['free', 'pro', 'enterprise'] },
}

// ─── Node Configuration (per-type data payloads) ─────────────────
export interface VoiceTriggerConfig {
  keywords: string[]
  language?: string
}

export interface DecisionConfig {
  condition: string           // Human-readable: "vibration > threshold"
  trueLabel?: string          // "Yes" / "High"
  falseLabel?: string         // "No" / "Normal"
}

export interface ChecklistGateConfig {
  items: { id: string; label: string; required: boolean }[]
}

export interface SendAlertConfig {
  channel: 'email' | 'slack' | 'telegram' | 'push'
  recipient?: string          // email address, channel ID, etc
  messageTemplate: string     // supports {{variable}} placeholders
}

export interface CreateTicketConfig {
  service: 'jira' | 'servicenow' | 'email_fallback'
  titleTemplate: string
  descriptionTemplate: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  assignee?: string
}

export interface GenerateReportConfig {
  format: 'pdf' | 'xlsx'
  templateId?: string
  includePhotos: boolean
}

export interface UpdateSheetConfig {
  sheetId?: string
  sheetName?: string
  columns: { header: string; valueTemplate: string }[]
}

export interface TimerWaitConfig {
  durationSeconds: number
}

export interface AiSuggestConfig {
  prompt: string
  context?: string
}

export interface SubWorkflowConfig {
  workflowId: string
}

export type NodeConfig =
  | VoiceTriggerConfig
  | DecisionConfig
  | ChecklistGateConfig
  | SendAlertConfig
  | CreateTicketConfig
  | GenerateReportConfig
  | UpdateSheetConfig
  | TimerWaitConfig
  | AiSuggestConfig
  | SubWorkflowConfig
  | Record<string, unknown>   // Generic for simple nodes

// ─── Workflow Node (what React Flow renders) ─────────────────────
export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  label: string               // User-editable display name
  config: NodeConfig
  position: { x: number; y: number }  // Canvas position
}

// ─── Workflow Edge (connections between nodes) ────────────────────
export interface WorkflowEdge {
  id: string
  source: string              // Node ID
  target: string              // Node ID
  sourceHandle?: string       // For decision nodes: 'true' | 'false'
  label?: string              // Edge label
  animated?: boolean
}

// ─── Safety & Compliance Metadata ────────────────────────────────
export interface SafetyCheck {
  requiresLoto: boolean       // Lockout/Tagout
  ppeRequired: string[]       // 'gloves', 'glasses', 'helmet', etc
  safetyWarning?: string      // Free-text warning
}

// ─── Target Asset (what equipment this workflow is for) ──────────
export interface TargetAsset {
  type: string                // 'electric_motor', 'pump', 'server', 'hvac', etc
  brand?: string              // 'Siemens', 'Bosch', 'Dell', 'Generic'
  model?: string              // '1FK7', 'R740', etc
  tags?: string[]             // Searchable tags
}

// ─── The Complete Workflow Definition ─────────────────────────────
export interface Workflow {
  id: string
  title: string
  description: string
  authorId: string
  createdAt: string           // ISO 8601
  updatedAt: string           // ISO 8601
  version: number
  isPublic: boolean           // false = private by default
  status: 'draft' | 'active' | 'archived'

  targetAsset?: TargetAsset
  safetyCheck?: SafetyCheck

  nodes: WorkflowNode[]
  edges: WorkflowEdge[]

  // Metadata
  tags: string[]
  executionCount: number
  lastExecutedAt?: string
}

// ─── Voice-to-Workflow AI Output ─────────────────────────────────
// This is what the LLM returns after parsing voice input
export interface VoiceWorkflowIntent {
  title: string
  description: string
  targetAsset?: TargetAsset
  trigger: {
    type: WorkflowNodeType
    keywords?: string[]
  }
  steps: {
    type: WorkflowNodeType
    label: string
    config: NodeConfig
    conditionRef?: string     // For decision nodes: what step to branch from
  }[]
  safetyCheck?: SafetyCheck
}

// ─── Confirmation Card (mobile UI) ───────────────────────────────
export type CardStatus = 'pending' | 'confirmed' | 'editing' | 'rejected'

export interface ConfirmationCard {
  workflowIntent: VoiceWorkflowIntent
  status: CardStatus
  userEdits?: Partial<VoiceWorkflowIntent>
}

// ─── Execution Runtime ───────────────────────────────────────────
export type StepExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface WorkflowExecution {
  id: string
  workflowId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  steps: {
    nodeId: string
    status: StepExecutionStatus
    startedAt?: string
    completedAt?: string
    output?: unknown
    error?: string
  }[]
}
