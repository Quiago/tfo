# OpsFlow → Enterprise Datacenter Platform — Roadmap

> **Regla global:** Todo lo implementado en este roadmap es **datacenter-mode only**.
> Ningún componente, ruta, ni endpoint nuevo debe ser visible en `platformMode === 'factory'`.
> Gate en frontend: `if (platformMode !== 'datacenter') return null`
> Gate en backend: endpoint headers o query param `platform_mode` validado donde aplique.

---

## Estado general

| Fase | Nombre | Estado | Commit |
|------|--------|--------|--------|
| 0 | Event Dispatcher Core | ⬜ Pendiente | — |
| 1 | M365 Teams + ServiceNow | ⬜ Pendiente | — |
| 2 | Alarm Management Console | ⬜ Pendiente | — |
| 3 | RBAC + Audit Trail | ⬜ Pendiente | — |
| 4 | Shift Handover Module | ⬜ Pendiente | — |
| 5 | CAFM Connector (Maximo) | ⬜ Pendiente | — |

---

## Fase 0 — Event Dispatcher Core

**Objetivo:** Crear el nervio central que une fuentes de eventos con acciones ejecutables.
**Duración estimada:** 1 semana
**Datacenter only:** Sí — reglas y eventos solo se crean/muestran en modo datacenter.

### Arquitectura

```
Fuentes de eventos          Dispatcher Core              Execution Layer
────────────────────   →   ─────────────────────   →   ──────────────────────
OPC-UA alarm               Rule Engine                  → Teams message
Sensor threshold           Event enrichment             → ServiceNow ticket
Manual trigger             Priority routing             → Email / SMS
Schedule trigger           SLA timer                    → Work order creation
Webhook (BMS/DCIM)         Suppression logic            → Escalation chain
                           Audit logger                 → PDF report
```

### Checklist Backend

- [ ] `backend/app/api/v1/dispatcher/models.py`
  - [ ] `AlarmEvent`: id, source_connector_id, severity, category, asset_id, raw_payload(JSON), enriched(JSON), status, received_at
  - [ ] `DispatchRule`: id, name, platform_mode, conditions(JSON), actions(JSON), enabled, priority, suppression_window_secs, created_by
  - [ ] `DispatchExecution`: id, rule_id, event_id, started_at, completed_at, status, action_results(JSON), error_detail
- [ ] `backend/app/api/v1/dispatcher/schemas.py`
  - [ ] `EventIn`, `RuleCreate`, `RuleUpdate`, `ExecutionOut`, `EventStatus` enum
- [ ] `backend/app/api/v1/dispatcher/rule_engine.py`
  - [ ] Condiciones: `threshold`, `contains`, `severity_gte`, `asset_tag`, `connector_id`
  - [ ] Composición: `AND` / `OR`
  - [ ] Funciones puras sin side effects (fácil de testear)
- [ ] `backend/app/api/v1/dispatcher/service.py`
  - [ ] `intake(event)` → enrich → match_rules → execute_actions → log
  - [ ] `execute_actions(rule, event)` → dispatcher de action types
  - [ ] `suppress(rule_id, duration)` → ventana de supresión
  - [ ] `get_events(filters)` → con paginación
- [ ] `backend/app/api/v1/dispatcher/router.py`
  - [ ] `POST /dispatcher/events` — ingesta manual / webhook
  - [ ] `GET /dispatcher/events` — historial con filtros
  - [ ] `GET /dispatcher/rules` — listar reglas
  - [ ] `POST /dispatcher/rules` — crear regla
  - [ ] `PATCH /dispatcher/rules/{id}` — editar regla
  - [ ] `DELETE /dispatcher/rules/{id}` — eliminar regla
  - [ ] `GET /dispatcher/executions` — historial de ejecuciones
  - [ ] `GET /dispatcher/stream` — SSE: feed en tiempo real
- [ ] `backend/app/api/v1/connectors/backends/webhook.py`
  - [ ] Inbound webhook connector (recibe eventos externos)
- [ ] `backend/app/db/engine.py` — migraciones manuales para las 3 nuevas tablas
- [ ] `backend/app/api/v1/router.py` — registrar dispatcher router

### Checklist Frontend

- [ ] `frontend/lib/types/dispatcher.ts`
  - [ ] `AlarmEvent`, `DispatchRule`, `DispatchExecution`, `RuleCondition`, `RuleAction`
  - [ ] `AlarmSeverity`: `info | warning | critical | emergency`
  - [ ] `EventStatus`: `pending | matched | executing | completed | suppressed | failed`
- [ ] `frontend/lib/services/dispatcher.service.ts`
  - [ ] HTTP calls: CRUD rules, fetch events/executions
  - [ ] SSE hook: `useDispatcherStream()`
- [ ] `frontend/lib/store/dispatcher-store.ts`
  - [ ] Zustand: `events[]`, `rules[]`, `executions[]`, `activeRule`
- [ ] `frontend/components/dispatcher/EventFeed.tsx`
  - [ ] Lista en tiempo real vía SSE — severity badge, timestamp, asset, status
- [ ] `frontend/components/dispatcher/RuleBuilder.tsx`
  - [ ] Form crear/editar regla con validación
- [ ] `frontend/components/dispatcher/RuleConditionEditor.tsx`
  - [ ] Editor AND/OR de condiciones
- [ ] `frontend/components/dispatcher/ActionListEditor.tsx`
  - [ ] Lista de acciones por regla (inicialmente: `log_only`, `create_work_order`)
- [ ] `frontend/components/dispatcher/DispatcherConsole.tsx`
  - [ ] Panel principal: EventFeed + RuleList + RuleBuilder
- [ ] `frontend/components/dispatcher/AlarmSimulator.tsx`
  - [ ] Solo en `NEXT_PUBLIC_DEMO_MODE=true` — genera eventos sintéticos por categoría
- [ ] Integrar `DispatcherConsole` en OpsHub — visible solo si `platformMode === 'datacenter'`

### Checklist Tests

- [ ] `backend/tests/dispatcher/test_rule_engine.py`
  - [ ] Condición simple threshold: match y no-match
  - [ ] Condición contains: match y no-match
  - [ ] Composición AND: ambas condiciones deben cumplirse
  - [ ] Composición OR: basta una
  - [ ] severity_gte: escalas correctas
  - [ ] Edge case: regla sin condiciones (match-all)
  - [ ] Edge case: regla deshabilitada no matchea
- [ ] `backend/tests/dispatcher/test_service.py`
  - [ ] `intake()` con regla que matchea → execution creada
  - [ ] `intake()` sin reglas → sin execution
  - [ ] `intake()` con supresión activa → evento marcado suppressed
  - [ ] `execute_actions()` con mock de action handlers
- [ ] `backend/tests/dispatcher/test_router.py`
  - [ ] `POST /dispatcher/events` → 201
  - [ ] `GET /dispatcher/events` → lista paginada
  - [ ] `POST /dispatcher/rules` → 201 con regla válida
  - [ ] `POST /dispatcher/rules` → 422 con condiciones inválidas
  - [ ] `DELETE /dispatcher/rules/{id}` → 204
- [ ] `frontend/__tests__/dispatcher/RuleBuilder.test.tsx`
  - [ ] Render form vacío
  - [ ] Submit con datos válidos
  - [ ] Validación: título requerido
- [ ] `frontend/__tests__/dispatcher/EventFeed.test.tsx`
  - [ ] Render lista de eventos
  - [ ] Badge de severidad correcto

### Demo sin DC
Usar `AlarmSimulator` (visible en demo mode) para generar eventos: CRAC failure / UPS degradation / PDU overload / High temp. El `POST /dispatcher/events` está abierto para ingesta manual también desde curl o Postman.

---

## Fase 1 — M365 Teams + ServiceNow

**Objetivo:** Conectar OpsFlow con los sistemas de comunicación y ticketing que Khazna ya usa.
**Duración estimada:** 1.5 semanas
**Datacenter only:** Sí — sección Integrations visible solo en modo datacenter.

### Checklist Backend

- [ ] `backend/app/api/v1/connectors/backends/teams.py`
  - [ ] `TeamsConnector(ConnectorBackend)`: write via Incoming Webhook, health check
  - [ ] Adaptive Card template (JSON) para alertas con severity color coding
  - [ ] Registrar en `_REGISTRY` como `ConnectorType.teams`
- [ ] `backend/app/api/v1/connectors/backends/servicenow.py`
  - [ ] `ServiceNowConnector(ConnectorBackend)`: read/write incidents y change_requests
  - [ ] `health()` → GET /api/now/table/sys_user?sysparm_limit=1
  - [ ] `discover()` → tablas disponibles (incident, problem, change_request)
  - [ ] Registrar en `_REGISTRY` como `ConnectorType.servicenow`
- [ ] `backend/app/api/v1/connectors/backends/smtp_email.py`
  - [ ] `SMTPEmailConnector(ConnectorBackend)`: send via SMTP o M365 Mail
  - [ ] Registrar en `_REGISTRY` como `ConnectorType.email`
- [ ] `backend/app/api/v1/integrations/models.py`
  - [ ] `IntegrationConfig`: id, name, type, config_encrypted(JSON), platform_mode, is_active, last_tested_at, last_test_status
- [ ] `backend/app/api/v1/integrations/schemas.py`
  - [ ] `IntegrationCreate`, `IntegrationOut`, `IntegrationTestResult`
- [ ] `backend/app/api/v1/integrations/service.py`
  - [ ] `create()`, `update()`, `delete()`, `test_connection()`, `dispatch_action()`
  - [ ] Encriptación de config en reposo (Fernet)
- [ ] `backend/app/api/v1/integrations/router.py`
  - [ ] CRUD `/integrations`
  - [ ] `POST /integrations/{id}/test`
- [ ] Dispatcher `action_types` expandido: `send_teams`, `create_servicenow_incident`, `send_email`
- [ ] `backend/app/db/engine.py` — migración `integration_configs` tabla

### Checklist Frontend

- [ ] `frontend/lib/types/integrations.ts`
- [ ] `frontend/lib/services/integrations.service.ts`
- [ ] `frontend/components/integrations/IntegrationsList.tsx`
- [ ] `frontend/components/integrations/IntegrationForm.tsx`
  - [ ] Teams: webhook URL field
  - [ ] ServiceNow: instance URL, username, password fields
  - [ ] Email: SMTP host, port, credentials
- [ ] `frontend/components/integrations/IntegrationTestModal.tsx`
- [ ] `frontend/components/integrations/IntegrationBadge.tsx`
- [ ] `frontend/components/dispatcher/ActionListEditor.tsx` — añadir tipos `send_teams`, `create_servicenow_incident`
- [ ] Sección Integrations en nav/settings (datacenter mode only)

### Checklist Tests

- [ ] `backend/tests/integrations/test_teams_backend.py` — mock webhook responses
- [ ] `backend/tests/integrations/test_servicenow_backend.py` — mock SN REST API
- [ ] `backend/tests/integrations/test_smtp_backend.py` — mock SMTP send
- [ ] `backend/tests/integrations/test_integration_service.py` — CRUD + dispatch
- [ ] `backend/tests/integrations/test_integration_router.py` — HTTP endpoints

### Demo sin DC
1. Teams: workspace gratuito → Incoming Webhook → pegar URL → Test → verificar card en Teams
2. ServiceNow: PDI gratuito en developer.servicenow.com → configurar credenciales → crear incident real
3. Simular evento en Dispatcher → rule con acción `send_teams` + `create_servicenow_incident` → verificar ambos

---

## Fase 2 — Alarm Management Console

**Objetivo:** NOC-ready alarm console con clasificación, supresión, ACK y escalación automática.
**Duración estimada:** 1.5 semanas
**Datacenter only:** Sí.

### Checklist Backend

- [ ] `backend/app/api/v1/alarms/models.py`
  - [ ] `AlarmDefinition`: id, code, name, category, severity, auto_dispatch_rule_id, sop_template_id, suppression_default_mins
  - [ ] `AlarmState`: id, definition_id, connector_id, asset_id, value_at_trigger, triggered_at, acknowledged_at, acknowledged_by, cleared_at, suppressed_until, dispatch_execution_id, notes
  - [ ] `AlarmSuppressionRule`: id, asset_id, connector_id, category, suppressed_until, reason, created_by
- [ ] `backend/app/api/v1/alarms/schemas.py`
- [ ] `backend/app/api/v1/alarms/service.py`
  - [ ] `intake(alarm_event)` → busca definición → crea AlarmState → evalúa supresión → dispara Dispatcher
  - [ ] `acknowledge(alarm_id, user_id)`
  - [ ] `suppress(alarm_id, duration_mins, reason)`
  - [ ] `auto_clear(alarm_id)`
  - [ ] `get_active_alarms(filters)` — P1/P2 ordenados por severity + age
- [ ] `backend/app/api/v1/alarms/router.py`
  - [ ] `GET /alarms` — activas con filtros
  - [ ] `POST /alarms/{id}/acknowledge`
  - [ ] `POST /alarms/{id}/suppress`
  - [ ] `GET /alarms/stream` — SSE feed
  - [ ] `GET /alarms/definitions` — catálogo de tipos
  - [ ] `POST /alarms/definitions` — crear definición
- [ ] Hook en TelemetryService para emitir al AlarmService en threshold breach
- [ ] Migración DB: 3 nuevas tablas

### Checklist Frontend

- [ ] `frontend/lib/types/alarms.ts`
- [ ] `frontend/lib/services/alarms.service.ts`
- [ ] `frontend/components/alarms/AlarmKPIBar.tsx` — P1 activas, MTTR, ack rate
- [ ] `frontend/components/alarms/AlarmRow.tsx` — severity badge, ack button, suppress
- [ ] `frontend/components/alarms/AlarmDetailPanel.tsx` — timeline evento, SOP, dispatch history
- [ ] `frontend/components/alarms/SuppressionModal.tsx`
- [ ] `frontend/components/alarms/AlarmConsole.tsx` — tabla principal + filtros
- [ ] `frontend/components/alarms/AlarmSimulator.tsx` — DEV/DEMO mode only
- [ ] Integrar `AlarmConsole` en Overview (datacenter mode) como panel central

### Checklist Tests

- [ ] `backend/tests/alarms/test_alarm_service.py` — intake, suppress, ack, auto-clear
- [ ] `backend/tests/alarms/test_suppression_logic.py` — edge cases
- [ ] `backend/tests/alarms/test_alarm_router.py` — HTTP endpoints

---

## Fase 3 — RBAC + Audit Trail

**Objetivo:** Governance enterprise: roles, permisos y trazabilidad completa.
**Duración estimada:** 1 semana
**Datacenter only:** RBAC aplica a toda la plataforma. Audit log visible solo en datacenter mode para el contexto DC, pero el mecanismo de logging es global.

### Checklist Backend

- [ ] `backend/app/models/user.py` — añadir campo `role: str = 'operator'`
- [ ] `backend/app/core/permissions.py`
  - [ ] `Role` enum: `viewer | operator | manager | admin`
  - [ ] Matrix de permisos por endpoint
  - [ ] `require_role(*roles)` dependency
- [ ] `backend/app/api/v1/audit/models.py`
  - [ ] `AuditEntry`: id, user_id, action, resource_type, resource_id, payload_snapshot(JSON), ip_address, timestamp
- [ ] `backend/app/api/v1/audit/service.py`
  - [ ] `log(user, action, resource_type, resource_id, payload)`
  - [ ] `query(filters)` con paginación
  - [ ] `export_csv()` / `export_pdf()`
- [ ] `backend/app/api/v1/audit/router.py`
  - [ ] `GET /audit/entries` — admin only
  - [ ] `GET /audit/export` — CSV/PDF download
- [ ] Aplicar `require_role()` en routers existentes y nuevos (dispatcher, alarms, integrations)
- [ ] Llamadas a `audit_service.log()` en: login, rule create/delete, alarm ack, handover complete, integration config change
- [ ] Migración DB: `role` en users, nueva tabla `audit_entries`

### Checklist Frontend

- [ ] `frontend/lib/store/auth-store.ts` — añadir `role` al user type
- [ ] `frontend/components/admin/UserManagement.tsx`
- [ ] `frontend/components/admin/AuditLog.tsx`
- [ ] `frontend/components/admin/AuditExport.tsx`
- [ ] Role-aware UI: botones disabled/hidden según `user.role` (UX only, backend es árbitro)
- [ ] Sección Admin visible solo para `role === 'admin'` y `platformMode === 'datacenter'`

### Checklist Tests

- [ ] `backend/tests/auth/test_rbac_permissions.py` — require_role con cada rol
- [ ] `backend/tests/auth/test_audit_service.py` — log + query
- [ ] `backend/tests/integration/test_rbac_routes.py` — 403 cuando rol insuficiente en todos los endpoints nuevos

---

## Fase 4 — Shift Handover Module

**Objetivo:** Gestión digital de cambios de turno para operaciones 24/7.
**Duración estimada:** 1 semana
**Datacenter only:** Sí.

### Checklist Backend

- [ ] `backend/app/api/v1/handover/models.py`
  - [ ] `HandoverReport`: id, shift, facility_id, platform_mode, created_by, handed_to, started_at, completed_at, active_alarms_snapshot(JSON), pending_work_orders(JSON), active_dispatch_rules(JSON), critical_notes, follow_up_actions(JSON), digital_signature_hash, status(draft|signed|received)
- [ ] `backend/app/api/v1/handover/schemas.py`
- [ ] `backend/app/api/v1/handover/service.py`
  - [ ] `create_handover()` — auto-populate con snapshot estado actual
  - [ ] `complete_handover(id, signature, handed_to)` — firma + dispatch email Teams
  - [ ] `receive_handover(id)` — confirma recepción
  - [ ] `get_current_shift()` — borrador del turno activo
  - [ ] `get_history(facility_id)` — historial paginado
- [ ] `backend/app/api/v1/handover/router.py`
  - [ ] `GET /handover/current`
  - [ ] `POST /handover`
  - [ ] `PATCH /handover/{id}`
  - [ ] `POST /handover/{id}/complete`
  - [ ] `POST /handover/{id}/receive`
  - [ ] `GET /handover/history`
- [ ] `complete_handover()` dispara evento al Dispatcher: `handover_completed` → Teams notification
- [ ] Migración DB: `handover_reports` tabla

### Checklist Frontend

- [ ] `frontend/lib/types/handover.ts`
- [ ] `frontend/lib/services/handover.service.ts`
- [ ] `frontend/components/handover/AlarmSnapshot.tsx`
- [ ] `frontend/components/handover/WorkOrderSummary.tsx`
- [ ] `frontend/components/handover/CriticalNotes.tsx`
- [ ] `frontend/components/handover/FollowUpActions.tsx`
- [ ] `frontend/components/handover/HandoverForm.tsx`
- [ ] `frontend/components/handover/HandoverSignModal.tsx`
- [ ] `frontend/components/handover/HandoverCard.tsx`
- [ ] `frontend/components/handover/HandoverHistoryList.tsx`
- [ ] `frontend/components/handover/HandoverDashboard.tsx`
- [ ] Integrar `HandoverDashboard` en OpsHub (datacenter mode only)

### Checklist Tests

- [ ] `backend/tests/handover/test_handover_service.py` — create, auto-populate, complete, receive
- [ ] `backend/tests/handover/test_handover_router.py` — flujo completo draft → signed → received

---

## Fase 5 — CAFM Connector (Maximo / Generic CMMS)

**Objetivo:** Integración bidireccional con el CAFM/CMMS existente de Khazna.
**Duración estimada:** 1.5 semanas
**Datacenter only:** Sí.

### Checklist Backend

- [ ] `backend/app/api/v1/connectors/backends/maximo.py`
  - [ ] `MaximoConnector(ConnectorBackend)`: read/write WOs via OSLC/JSON-API
  - [ ] `health()` → GET /maximo/oslc/whoami
  - [ ] `discover()` → asset locations, work types, priority levels
  - [ ] Registrar en `_REGISTRY` como `ConnectorType.maximo`
- [ ] `backend/app/api/v1/connectors/backends/cmms_generic.py`
  - [ ] `GenericCMMSConnector(ConnectorBackend)`: field mapping configurable via JSON
  - [ ] Registrar en `_REGISTRY` como `ConnectorType.cmms_generic`
- [ ] `backend/app/api/v1/work_orders/models.py`
  - [ ] `WorkOrderSync`: local_id, external_id, source_system, sync_status, last_synced_at
- [ ] `backend/app/api/v1/work_orders/service.py`
  - [ ] `create_external(work_order, connector_id)` — crea en CAFM externo
  - [ ] `sync_status(external_id, connector_id)` — lee estado del CAFM
  - [ ] `update_external(work_order, connector_id)` — actualiza en CAFM
- [ ] `backend/app/api/v1/work_orders/router.py`
  - [ ] `POST /work-orders/external`
  - [ ] `GET /work-orders/sync-status`
- [ ] Dispatcher action type: `create_cafm_work_order`
- [ ] Webhook receptor: Maximo cierra WO → OpsFlow recibe → cierra AlarmState
- [ ] Migración DB: `work_order_sync` tabla

### Checklist Frontend

- [ ] `frontend/lib/types/work-orders.ts` — tipos de sync y estado externo
- [ ] `frontend/lib/services/work-orders.service.ts`
- [ ] `frontend/components/integrations/IntegrationForm.tsx` — añadir tipo `maximo` y `cmms_generic`
- [ ] `frontend/components/dispatcher/ActionListEditor.tsx` — añadir tipo `create_cafm_work_order`
- [ ] Badge de sync status en OpsHub work orders (datacenter mode)

### Checklist Tests

- [ ] `backend/tests/connectors/test_maximo_backend.py` — mock Maximo API
- [ ] `backend/tests/connectors/test_cmms_generic_backend.py` — field mapping
- [ ] `backend/tests/work_orders/test_sync_service.py` — create, sync, update

---

## Convenciones de commits

Cada fase completa su commit con el formato:

```
feat(dc): [Fase N] <nombre corto>

Backend:
- [+] backend/path/file.py — descripción
- [~] backend/path/file.py — qué cambió y por qué

Frontend:
- [+] frontend/path/Component.tsx — descripción
- [~] frontend/path/file.ts — qué cambió y por qué

Tests:
- [+] tests/path/test_file.py — qué cubre

Notes:
- Datacenter-only: <cómo se gate el feature>
- Breaking changes: ninguno / <qué cambió>
- Migraciones: <qué ALTER TABLE se añadió>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Notas de arquitectura

- **Dispatcher Core** es prerequisito de todas las fases siguientes (1–5 se enchufan a él)
- **ConnectorBackend** es el patrón de extensión para todas las integraciones (Teams, ServiceNow, Maximo)
- **Tool Registry** se expande automáticamente en cada fase — el agente IA gana capacidades sin cambios al loop
- **Audit Trail** (Fase 3) debe estar activo antes de producción — considerar adelantarlo si hay presión de tiempo
- **Migraciones**: siempre manuales en `engine.py` — sin Alembic, consistente con patrón existente
- **Demo Mode**: `NEXT_PUBLIC_DEMO_MODE=true` activa simuladores y datos de ejemplo — nunca en producción
