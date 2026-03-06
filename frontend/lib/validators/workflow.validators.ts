import { z } from 'zod'

export const WorkflowNodeTypeSchema = z.enum([
  'voice_trigger', 'manual_trigger', 'sensor_trigger', 'schedule_trigger',
  'decision', 'checklist_gate',
  'voice_input', 'photo_input', 'text_input', 'number_input',
  'create_ticket', 'send_alert', 'log_entry', 'generate_report', 'update_sheet',
  'timer_wait', 'ai_suggest', 'sub_workflow', 'note',
])

export const TargetAssetSchema = z.object({
  type: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const SafetyCheckSchema = z.object({
  requiresLoto: z.boolean(),
  ppeRequired: z.array(z.string()),
  safetyWarning: z.string().optional(),
})

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: WorkflowNodeTypeSchema,
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }),
})

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
  animated: z.boolean().optional(),
})

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  authorId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
  isPublic: z.boolean(),
  status: z.enum(['draft', 'active', 'archived']),
  targetAsset: TargetAssetSchema.optional(),
  safetyCheck: SafetyCheckSchema.optional(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  tags: z.array(z.string()),
  executionCount: z.number().int().min(0),
  lastExecutedAt: z.string().datetime().optional(),
})

export const VoiceWorkflowIntentSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  targetAsset: TargetAssetSchema.optional(),
  trigger: z.object({
    type: WorkflowNodeTypeSchema,
    keywords: z.array(z.string()).optional(),
  }),
  steps: z.array(z.object({
    type: WorkflowNodeTypeSchema,
    label: z.string(),
    config: z.record(z.string(), z.unknown()),
    conditionRef: z.string().optional(),
  })),
  safetyCheck: SafetyCheckSchema.optional(),
})
