# Fases de implementación pendientes — m2-back

> Referencia completa: [implementation-plan.md](implementation-plan.md)
> Estado: FASE 0 completada. Fases 1-5 pendientes.

---

## FASE 1 — Common, Auth y módulos CRUD base

**Objetivo**: Guards, pipes, filtros reutilizables. Autenticación JWT. CRUDs de Tenants, Users, Channels, Contacts, Conversations, Messages.

### 1.1 — Common (infraestructura transversal)

Crear `api/src/common/` con:

- `guards/api-key.guard.ts` — Valida API key en header `x-api-key`
- `guards/tenant.guard.ts` — Extrae `tenantId` del JWT y lo inyecta en request
- `decorators/tenant.decorator.ts` — `@CurrentTenant()` extrae tenantId del request
- `decorators/user.decorator.ts` — `@CurrentUser()` extrae user del JWT
- `interceptors/transform.interceptor.ts` — Respuestas en formato `{ success, data, meta }`
- `interceptors/logging.interceptor.ts` — Loguea method, path, status, tiempo
- `filters/http-exception.filter.ts` — Formato estándar de errores `{ success: false, error, statusCode }`
- `pipes/validation.pipe.ts` — Pipe global con class-validator
- `dto/pagination.dto.ts` — DTO reutilizable (page, limit, sortBy, sortOrder)
- `dto/api-response.dto.ts` — Tipado de respuesta estándar
- `interfaces/normalized-message.interface.ts` — Interfaz NormalizedMessage
- `interfaces/channel-adapter.interface.ts` — Interfaz IChannelAdapter

### 1.2 — Módulo Auth

Crear `api/src/modules/auth/`:

- JWT Strategy con Passport (`{ sub: userId, tenantId, role }`)
- Guards: `jwt-auth.guard.ts`, `roles.guard.ts` con decorador `@Roles()`
- Endpoints:
  - `POST /auth/register` — Crea tenant + user OWNER. Retorna JWT
  - `POST /auth/login` — Valida credenciales. Retorna access + refresh token
  - `POST /auth/refresh` — Renueva access token
  - `GET /auth/me` — User actual con su tenant
- Passwords con `bcrypt`, refresh tokens en Redis (TTL 7 días)
- Dependencias nuevas: `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt`, `bcrypt`

### 1.3 — Módulo Tenants

- `GET /tenants/me` — Info del tenant actual
- `PATCH /tenants/me` — Actualizar nombre, settings
- Solo accesible por OWNER

### 1.4 — Módulo Channels

- CRUD completo: `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
- Credenciales encriptadas con AES-256 (`shared/utils/crypto.util.ts`)
- Auto-generar `webhookSecret` al crear canal

### 1.5 — Módulo Contacts

- CRUD: `GET` (paginación + búsqueda), `GET /:id`, `PATCH /:id`, `DELETE /:id`
- Contacto se crea automáticamente al llegar mensaje nuevo (FASE 2)

### 1.6 — Módulo Conversations

- `GET /conversations` — Filtros: status, channelId, assignedToId, contactId
- `GET /conversations/:id` — Detalle con mensajes paginados
- `PATCH /conversations/:id` — Cambiar status, asignar agente, toggle aiEnabled
- `POST /conversations/:id/close` — Cerrar conversación

### 1.7 — Módulo Messages

- Solo lectura: `GET /messages?conversationId=X`, `GET /messages/:id`
- Filtros: conversationId, direction, contentType, dateRange

**Criterio de éxito**: CRUDs funcionan. Swagger documenta todo. Auth protege rutas. Queries filtran por tenantId.

**Archivos resultantes**:
```
api/src/
├── common/
│   ├── guards/        (api-key, tenant, roles)
│   ├── decorators/    (tenant, user, roles)
│   ├── interceptors/  (transform, logging)
│   ├── filters/       (http-exception)
│   ├── pipes/         (validation)
│   ├── dto/           (pagination, api-response)
│   └── interfaces/    (normalized-message, channel-adapter)
├── modules/
│   ├── auth/
│   ├── tenants/
│   ├── channels/
│   ├── contacts/
│   ├── conversations/
│   └── messages/
└── shared/utils/crypto.util.ts
```

---

## FASE 2 — Webhooks, adaptadores de canal y pipeline de mensajes

**Objetivo**: Recibir webhooks reales, normalizar mensajes, pasarlos por pipeline y almacenarlos.

### 2.1 — Módulo Webhooks

- `POST /webhooks/:channelType/:channelId` — Recibe webhooks (sin auth JWT, validación por firma)
- `GET /webhooks/:channelType/:channelId` — Verificación de webhook (Meta challenge)
- Flujo: buscar canal → loguear en WebhookLog → validar firma → normalizar → encolar en BullMQ → responder 200

### 2.2 — Adaptadores de canal (Strategy Pattern)

- `base.adapter.ts` — Clase abstracta implementando IChannelAdapter
- `whatsapp.adapter.ts` — HMAC-SHA256, parsea WhatsApp Cloud API
- `instagram.adapter.ts` — HMAC-SHA256 Meta, parsea Instagram Messaging API
- `messenger.adapter.ts` — Similar a Instagram (plataforma Meta)
- `telegram.adapter.ts` — Validación por IP/secret token, parsea Telegram Bot API
- `adapter.factory.ts` — Factory que resuelve adapter por channelType

### 2.3 — Cola de mensajes entrantes (BullMQ)

- `queue.module.ts` — Registra colas con `@nestjs/bullmq`
- `inbound-message.processor.ts`:
  - Upsert Contact por externalId + channelType + tenantId
  - Buscar/crear Conversation
  - Crear Message (direction=INBOUND, status=RECEIVED)
  - Pasar por pipeline de procesamiento
  - Si aiEnabled → encolar para IA (FASE 3)
- Dependencias nuevas: `@nestjs/bullmq`, `bullmq`

### 2.4 — Pipeline de procesamiento

- `sanitizer.step.ts` — Elimina HTML/XSS, normaliza unicode, guarda en sanitizedContent
- `deduplicator.step.ts` — Detecta duplicados por externalId (Redis cache TTL 5min)
- `enricher.step.ts` — Detecta idioma, guarda metadata
- `validator.step.ts` — Valida contenido coherente, marca status=PROCESSED

### 2.5 — WebhookLog

- Todo webhook se loguea ANTES de procesar
- Cleanup job (cron) para borrar logs > 30 días

**Criterio de éxito**: POST simulando webhook → loguea, normaliza, crea contacto/conversación/mensaje. Duplicados detectados.

**Archivos resultantes**:
```
api/src/
├── modules/
│   ├── webhooks/
│   │   ├── webhooks.module.ts
│   │   ├── webhooks.controller.ts
│   │   ├── webhooks.service.ts
│   │   └── adapters/
│   │       ├── base.adapter.ts
│   │       ├── whatsapp.adapter.ts
│   │       ├── instagram.adapter.ts
│   │       ├── messenger.adapter.ts
│   │       ├── telegram.adapter.ts
│   │       └── adapter.factory.ts
│   └── message-pipeline/
│       ├── message-pipeline.module.ts
│       ├── message-pipeline.service.ts
│       └── steps/
│           ├── sanitizer.step.ts
│           ├── deduplicator.step.ts
│           ├── enricher.step.ts
│           └── validator.step.ts
├── queue/
│   ├── queue.module.ts
│   └── processors/inbound-message.processor.ts
└── shared/utils/text-cleaner.util.ts
```

---

## FASE 3 — AI Engine, memoria y contexto

**Objetivo**: Procesar mensajes con IA, gestionar contexto configurable por tenant y memoria conversacional.

### 3.1 — Módulo AI Context (CRUD)

- CRUD de configuraciones de IA: `POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
- Upload de archivos de contexto: `POST /ai-contexts/:id/files` (multipart)
- Extracción de texto: pdf-parse (PDFs), mammoth (docx), lectura directa (txt/csv)
- Dependencias nuevas: `pdf-parse`, `mammoth`, `@nestjs/platform-express` (multer)

### 3.2 — Módulo AI Memory

- `addEntry(conversationId, role, content)` — Crea AiMemoryEntry
- `getActiveMemory(conversationId, windowSize)` — Últimas N entradas activas
- `compressMemory(conversationId)` — Resume entradas antiguas con IA (role=SUMMARY)
- Cache en Redis (key: `memory:{conversationId}`, TTL 30min)

### 3.3 — Módulo AI Engine

- `context-builder.service.ts` — Arma contexto completo (system prompt + archivos + memoria + mensaje)
- `prompt-builder.service.ts` — Construye system prompt final
- `providers/openai.provider.ts` — Llama a OpenAI API
- `providers/anthropic.provider.ts` — Llama a Anthropic API
- `providers/provider.factory.ts` — Resuelve provider según AiContext.provider
- `ai-engine.service.ts` — Orquesta: mensaje → contexto → IA → memoria → respuesta
- Fallback: si IA falla → retorna fallbackMessage del AiContext
- Dependencias nuevas: `openai`, `@anthropic-ai/sdk`

### 3.4 — Integrar con processor de mensajes

- Después del pipeline, si aiEnabled: llamar a aiEngine → crear Message OUTBOUND → encolar para envío (FASE 4)

**Criterio de éxito**: Mensaje entrante genera respuesta de IA automáticamente. La IA usa system prompt, archivos de contexto y memoria.

**Archivos resultantes**:
```
api/src/modules/
├── ai-context/
│   ├── ai-context.module.ts
│   ├── ai-context.controller.ts
│   ├── ai-context.service.ts
│   ├── context-files.controller.ts
│   ├── context-files.service.ts
│   └── dto/
├── ai-memory/
│   ├── ai-memory.module.ts
│   ├── ai-memory.service.ts
│   └── dto/
├── ai-engine/
│   ├── ai-engine.module.ts
│   ├── ai-engine.service.ts
│   ├── context-builder.service.ts
│   ├── prompt-builder.service.ts
│   └── providers/
│       ├── base.provider.ts
│       ├── openai.provider.ts
│       ├── anthropic.provider.ts
│       └── provider.factory.ts
```

---

## FASE 4 — Response Dispatcher y acciones

**Objetivo**: Enviar respuestas de IA al canal correcto. Ejecutar acciones extra.

### 4.1 — Módulo Response Dispatcher

- `response-dispatcher.service.ts` — Recibe Message OUTBOUND → envía por canal correcto
- Senders por plataforma:
  - `whatsapp.sender.ts` — WhatsApp Cloud API
  - `instagram.sender.ts` — Instagram Send API
  - `messenger.sender.ts` — Messenger Send API
  - `telegram.sender.ts` — Telegram Bot API
- `outbound-message.processor.ts` — Cola de mensajes salientes con retry (3 intentos, backoff exponencial)
- Rate limiting por canal

### 4.2 — Módulo Actions

- `actions.service.ts` — Router de acciones según respuesta de IA
- Handlers:
  - `escalate-human.handler.ts` — Cambia status a WAITING_HUMAN, asigna agente
  - `create-ticket.handler.ts` — Placeholder para CRM
  - `send-notification.handler.ts` — Notificación al tenant
- Cada acción se loguea en ActionLog

**Criterio de éxito**: Mensaje de WhatsApp → respuesta IA → envío de vuelta. Escalación funciona.

**Archivos resultantes**:
```
api/src/modules/
├── response-dispatcher/
│   ├── response-dispatcher.module.ts
│   ├── response-dispatcher.service.ts
│   └── senders/
│       ├── base.sender.ts
│       ├── whatsapp.sender.ts
│       ├── instagram.sender.ts
│       ├── messenger.sender.ts
│       └── telegram.sender.ts
├── actions/
│   ├── actions.module.ts
│   ├── actions.service.ts
│   └── handlers/
│       ├── base-action.handler.ts
│       ├── escalate-human.handler.ts
│       ├── create-ticket.handler.ts
│       └── send-notification.handler.ts
└── queue/processors/outbound-message.processor.ts
```

---

## FASE 5 — Testing, seed data y hardening

**Objetivo**: Tests, datos de prueba, manejo de errores robusto, logging.

### 5.1 — Seed data

`api/prisma/seed.ts`:
- Tenant de prueba (plan PRO)
- User OWNER
- Canal WhatsApp + Instagram
- AiContext con system prompt
- 2-3 contactos con conversaciones y mensajes

### 5.2 — Tests unitarios

Prioritarios:
- `webhooks.service.spec.ts`
- `whatsapp.adapter.spec.ts`
- `message-pipeline.service.spec.ts`
- `ai-engine.service.spec.ts`
- `ai-memory.service.spec.ts`
- `crypto.util.spec.ts`

### 5.3 — Tests e2e

- Flujo completo: webhook → procesamiento → respuesta IA → envío
- Auth: registro, login, JWT, rechazo sin JWT
- Multitenancy: tenant A no ve datos de tenant B

### 5.4 — Hardening

- Rate limiting con `@nestjs/throttler`
- Helmet para headers de seguridad
- CORS por entorno
- Validación de IPs para webhooks (rangos de Meta)
- Timeout en llamadas a IA (30s, fallback si excede)
- Graceful shutdown (Prisma, Redis, BullMQ)
- Health checks detallados: `/health/db`, `/health/redis`, `/health/queues`
- Dependencias nuevas: `@nestjs/throttler`, `helmet`

### 5.5 — Logging estructurado

- Logger con `nestjs-pino` o Winston
- Formato JSON para producción
- Incluir siempre: tenantId, conversationId, channelType, requestId

**Criterio de éxito**: Tests pasan. Seed funciona. Sistema resiliente ante payloads malformados, timeouts, errores de red.
