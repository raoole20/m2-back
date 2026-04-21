# Motomoto Backend — Roadmap

> Snapshot: 2026-04-21 · Stack: NestJS 11 + TypeScript + Prisma + PostgreSQL 16 + Redis + BullMQ
> Fuente: auditoría cruzada contra `m2-front` (tipos en `packages/types/src/` y servicios en `apps/mobile/src/services/`).

Estado global: **~65% completo**. La base (multitenancy, pipeline de mensajes, IA multi-proveedor, webhooks entrantes, auth) está sólida. Faltan los endpoints "humanos" (responder, gestionar usuarios, subir archivos) y la capa de tiempo real.

---

## Leyenda
- ✅ Listo
- ⚠️ Parcial / con gaps
- ❌ No implementado
- 🚨 Bloqueante para MVP
- 🔒 Seguridad

---

## 1. Camino crítico (bloqueantes MVP)

### 1.1 🚨 Endpoint de mensajes salientes
**Problema:** no existe forma de que un agente responda desde la app. Solo hay flujo automático `webhook → IA → dispatcher`.

**Qué hacer:**
- [ ] `POST /api/conversations/:id/messages` con body `{ content, attachments?, idempotencyKey? }`
- [ ] Validar permisos (agente asignado o rol ≥ admin)
- [ ] Encolar en `message-outbound` (BullMQ) y devolver el `Message` en estado `PROCESSING`
- [ ] Usar `response-dispatcher` existente para enrutar al canal (Evolution / Meta / Telegram)
- [ ] Emitir evento WebSocket `message.new` (ver §2.1)

**Esfuerzo:** 1–2 d · **Depende de:** nada

---

### 1.2 🔒 Hardening webhook Evolution
**Problema:** callback hardcodeado `http://api:3000/webhooks/whatsapp/:channelId?token=...` — se rompe fuera de Docker y la apiKey viaja en querystring (queda en logs/proxies).

**Qué hacer:**
- [ ] Añadir env var `APP_PUBLIC_URL`
- [ ] Construir callback como `${APP_PUBLIC_URL}/webhooks/whatsapp/:channelId`
- [ ] Mover token a header `X-Webhook-Token` al registrar el webhook en Evolution
- [ ] Actualizar `webhooks.controller.ts` para validar el header en lugar del query param

**Esfuerzo:** 2–4 h · **Depende de:** nada

---

### 1.3 🚨 Endpoints de gestión de usuarios
**Problema:** no hay forma de invitar/gestionar agentes vía API. Solo existe `POST /auth/register` (self-service de owners).

**Qué hacer:**
- [ ] `GET /api/users` — listar del tenant actual (filtros: role, status)
- [ ] `POST /api/users` — invitar (genera email + token temporal) — solo ADMIN/OWNER
- [ ] `PATCH /api/users/:id` — actualizar role/status/avatarUrl (propietario o admin)
- [ ] `DELETE /api/users/:id` — soft-delete (solo OWNER)
- [ ] `POST /api/users/accept-invite` — aceptar invitación + setear contraseña

**Esfuerzo:** 1–2 d · **Depende de:** MailerModule (ya existe)

---

### 1.4 🚨 Alinear contratos con el frontend
**Problema:** los tipos que expone el backend no coinciden con `@m2/types`. Rompe tipado estricto en el front.

| Campo | Front espera | Back expone | Acción |
|-------|--------------|-------------|--------|
| `User.role` | `'agent' \| 'manager' \| 'admin'` | `OWNER \| ADMIN \| AGENT` | Añadir rol `MANAGER`, mapear en DTO (lowercase) |
| `User.avatarUrl` | `string?` | ausente | Añadir columna + migración |
| `User.status` | `UserStatus` | ausente | Añadir columna (`ONLINE\|AWAY\|OFFLINE`) |
| `ChannelType` | incluye `'email' \| 'sms'` | enum sin `EMAIL`/`SMS` | Ampliar enum Prisma |
| `Message.role` | `'inbound' \| 'outbound'` | `MessageDirection` | Renombrar en DTO de salida |
| `Message.suggestedReply` | `string?` | no persiste | Añadir columna |
| `Message.classification` | `MessageClassification?` | no persiste | Añadir columna JSON |

**Qué hacer:**
- [ ] Migración Prisma: `User.avatarUrl`, `User.status`, `Message.suggestedReply`, `Message.classification`, ampliar `ChannelType`, añadir `MANAGER` a `UserRole`
- [ ] Actualizar DTOs de salida (`UserDto`, `MessageDto`, `ChannelDto`) para emitir los nombres esperados por el front
- [ ] Ajustar `RolesGuard` para la nueva jerarquía (agent < manager < admin < owner)

**Esfuerzo:** 4–8 h · **Depende de:** nada

---

### 1.5 🚨 WebSocket gateway
**Problema:** no hay `@nestjs/websockets` ni socket.io instalados. El front hace polling cada 5s — no escala y da UX pobre.

**Qué hacer:**
- [ ] Instalar `@nestjs/websockets @nestjs/platform-socket.io socket.io`
- [ ] Crear `RealtimeModule` con `RealtimeGateway` (`@WebSocketGateway`)
- [ ] Autenticar handshake con JWT (mismo secret que REST)
- [ ] Scopear rooms por `tenantId` + `conversationId`
- [ ] Emitir eventos desde los servicios:
  - [ ] `message.new`, `message.updated`, `message.status_changed`
  - [ ] `conversation.new`, `conversation.updated`, `conversation.assigned`, `conversation.resolved`
  - [ ] `agent.status_changed`
  - [ ] `typing.start`, `typing.stop`
  - [ ] `connection.ack`, `connection.error`
- [ ] Publicar contrato en `@m2/types` (ya existe `websocket.ts` en el front)

**Esfuerzo:** 2–3 d · **Depende de:** 1.1 (para emitir en outbound)

---

## 2. Alta prioridad (flujo end-to-end)

### 2.1 Endpoint de uploads
- [ ] `POST /api/uploads` (multipart) → `{ assetId, url, mimeType, sizeBytes }`
- [ ] Storage local en dev, S3/R2 en prod (env var `STORAGE_DRIVER`)
- [ ] Firmar URLs cuando sea privado
- [ ] Enlazar con `MessageAttachment` al enviar mensaje saliente

**Esfuerzo:** 1–2 d

---

### 2.2 Canales Email y SMS
- [ ] Añadir `EMAIL` y `SMS` al enum `ChannelType` en Prisma
- [ ] `email.sender.ts` — reutilizar `MailerModule` (Nodemailer ya integrado)
- [ ] `sms.sender.ts` — elegir proveedor (Twilio / MessageBird) y documentar env vars
- [ ] Webhooks entrantes:
  - [ ] Email: IMAP poll o webhook del proveedor (Mailgun/Postmark)
  - [ ] SMS: webhook del proveedor
- [ ] Registrar senders en `response-dispatcher`

**Esfuerzo:** 2–3 d

---

### 2.3 Persistencia completa de campos IA
- [ ] Migración: `Message.suggestedReply`, `Message.classification`, `Message.aiConfidence`
- [ ] Actualizar `ai-engine.service` para escribir estos campos tras clasificar
- [ ] Exponer en `MessageDto`
- [ ] Test: mensaje entrante → IA clasifica → campos persisten → WebSocket emite update

**Esfuerzo:** 1 d · **Depende de:** 1.4

---

### 2.4 AI Memory — completar API
Schema ya tiene `AiMemoryEntry` pero no hay endpoints.

- [ ] `GET /api/ai-memory` (filtros: contactId, conversationId, key)
- [ ] `POST /api/ai-memory`
- [ ] `DELETE /api/ai-memory/:id`
- [ ] Hook de lectura en `ai-engine` para enriquecer prompts

**Esfuerzo:** 1 d

---

### 2.5 Actions Log — completar
`actions.controller.ts` está incompleto. Hay tabla de auditoría pero no se expone.

- [ ] `GET /api/actions` (filtros: actorId, resourceType, date range)
- [ ] Escribir audit entries desde guards/interceptors en operaciones mutables
- [ ] Paginación cursor-based

**Esfuerzo:** 1 d

---

## 3. Prioridad media (DX / ops)

### 3.1 CI/CD
- [ ] `.github/workflows/ci.yml`: lint + typecheck + test + build on PR
- [ ] `.github/workflows/deploy.yml`: deploy a staging en merge a `main`
- [ ] Badge en README
- [ ] Secret management (GitHub Actions secrets)

**Esfuerzo:** 1 d

---

### 3.2 Cobertura de tests
Actualmente 8 `.spec.ts`; e2e es stub (`GET /` → "Hello World").

- [ ] E2E del flujo auth completo (register → verify → login → refresh → me)
- [ ] E2E del pipeline de mensajes (webhook entrante → IA → dispatcher → WebSocket)
- [ ] Contract tests contra tipos de `@m2/types`
- [ ] Coverage mínimo 70% en módulos críticos (auth, messages, conversations, webhooks)

**Esfuerzo:** 2–3 d

---

### 3.3 SDK tipado para clientes
- [ ] Publicar `openapi.json` generado por Swagger
- [ ] Script `pnpm generate:sdk` que cree cliente TS consumible por mobile/admin/landing
- [ ] Versionar el SDK como paquete interno

**Esfuerzo:** 1–2 d · **Depende de:** 1.4 (contratos estables)

---

### 3.4 Observabilidad
- [ ] Logs estructurados (Pino) con `tenantId`, `requestId`, `userId`
- [ ] Health checks profundos (`/health/ready` vs `/health/live`)
- [ ] Métricas Prometheus (`/metrics`): latencia HTTP, jobs BullMQ, conexiones WS
- [ ] Sentry o equivalente para errores

**Esfuerzo:** 2 d

---

### 3.5 Rate limiting y seguridad
- [ ] `@nestjs/throttler` en endpoints públicos (auth, webhooks)
- [ ] Helmet
- [ ] CORS estricto por env (ya parcial, revisar)
- [ ] Rotación de JWT secret + refresh token reuse detection

**Esfuerzo:** 1 d

---

## 4. Backlog / nice-to-have

- [ ] Multi-región / replicación read-replica
- [ ] Archivado automático de conversaciones cerradas > 90 días
- [ ] Export CSV de conversaciones (para cumplimiento)
- [ ] Webhooks salientes (que el tenant reciba eventos en su sistema)
- [ ] Plantillas de respuesta rápida
- [ ] Métricas de agente (tiempo de respuesta, CSAT)
- [ ] Integración Slack/Discord para notificaciones internas

---

## Plan de sprints sugerido

### Sprint 1 — Camino crítico (5 días)
1.1 outbound messages · 1.2 webhook hardening · 1.3 users CRUD · 1.4 alinear contratos

**Resultado:** los agentes pueden responder desde la app y el front compila contra contratos reales.

### Sprint 2 — Tiempo real y adjuntos (4–5 días)
1.5 WebSocket · 2.1 uploads · 2.3 persistencia IA

**Resultado:** se elimina el polling, se soportan adjuntos, la IA deja trail completo.

### Sprint 3 — Canales y ops (5 días)
2.2 email/SMS · 3.1 CI/CD · 3.2 tests

**Resultado:** cobertura multicanal + pipeline automatizado.

### Sprint 4 — Hardening (3–4 días)
2.4 ai-memory · 2.5 actions · 3.4 observabilidad · 3.5 rate limiting

**Resultado:** listo para producción real con tráfico.

---

## Contratos de referencia (front)

Fuente de verdad de los tipos que el backend debe satisfacer:

- `m2-front/packages/types/src/user.ts`
- `m2-front/packages/types/src/channel.ts`
- `m2-front/packages/types/src/message.ts`
- `m2-front/packages/types/src/conversation.ts`
- `m2-front/packages/types/src/websocket.ts`
- `m2-front/packages/types/src/api.ts`

Cualquier cambio que toque DTOs de salida debe regenerar el SDK (§3.3) y validarse con `pnpm -w typecheck` en el front.
