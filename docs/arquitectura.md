# Arquitectura del backend `m2-back` — explicación completa

---

## 1. Contexto general

`m2-back` es el **backend de Motomoto**, una plataforma SaaS **multitenant** que centraliza conversaciones provenientes de múltiples canales de mensajería (WhatsApp, Instagram, Messenger, Telegram, WebChat) y las procesa con **IA configurable por tenant** (OpenAI, Anthropic, Gemini o un gateway custom). El frontend `m2-front` (Expo + landing Next.js) consume esta API.

**Resumen en una frase:** el backend recibe webhooks de canales → normaliza los payloads → persiste mensajes → encola procesamiento con IA → despacha la respuesta al mismo canal.

### Stack

| Componente | Tecnología |
|---|---|
| Framework | **NestJS 11** (TypeScript strict, ES2023) |
| ORM | **Prisma 6** |
| BD | **PostgreSQL 16** |
| Cache / Colas | **Redis 6** + **BullMQ** |
| Auth | **JWT** (Passport) + `bcrypt` |
| Mail | **Nodemailer** (Handlebars para plantillas) |
| IA | OpenAI · Anthropic · Gemini · Custom |
| Runtime | Node 20 (Docker alpine) |
| Orquestación dev | `docker-compose` (postgres + redis + mailhog + n8n + evolution-api + api) |

Ubicación del código: `api/src/`. Schema: `api/prisma/schema.prisma`.

---

## 2. Estructura de directorios

```
m2-back/
├── api/                                  ← App NestJS
│   ├── src/
│   │   ├── main.ts                       ← bootstrap, helmet, CORS, ValidationPipe, Swagger
│   │   ├── app.module.ts                 ← módulo raíz
│   │   ├── config/                       ← database/redis/mailer configs
│   │   ├── common/                       ← cross-cutting
│   │   │   ├── decorators/               ← @CurrentUser, @CurrentTenant, @Roles
│   │   │   ├── guards/                   ← JwtAuthGuard, TenantGuard, RolesGuard
│   │   │   ├── interceptors/             ← LoggingInterceptor, TransformInterceptor
│   │   │   ├── filters/                  ← HttpExceptionFilter
│   │   │   └── dto/                      ← PaginationDto, ApiResponseDto
│   │   ├── modules/                      ← una carpeta por feature
│   │   │   ├── auth/                     ← registro, login, JWT, reset password, verify email
│   │   │   ├── tenants/                  ← /tenants/me
│   │   │   ├── channels/                 ← CRUD canales + credenciales encriptadas
│   │   │   ├── contacts/                 ← CRUD contactos
│   │   │   ├── conversations/            ← listar/detallar/actualizar conversaciones
│   │   │   ├── messages/                 ← lectura de mensajes
│   │   │   ├── webhooks/                 ← entrypoint de canales (público)
│   │   │   │   └── adapters/             ← Adapter pattern: whatsapp, evolution, telegram, instagram, messenger
│   │   │   ├── ai-context/               ← configs de IA por tenant (prompt, modelo, provider…)
│   │   │   ├── ai-engine/                ← motor de inferencia
│   │   │   │   └── providers/            ← openai, anthropic, gemini
│   │   │   ├── ai-memory/                ← historial de conversación que se manda a la IA
│   │   │   ├── message-pipeline/         ← steps: contact-resolver, conversation-resolver, message-persister
│   │   │   ├── media-processor/          ← transcriptores de audio/imagen/video
│   │   │   ├── response-dispatcher/      ← Factory + senders por canal
│   │   │   ├── actions/                  ← ActionLog
│   │   │   └── mailer/                   ← plantillas hbs
│   │   ├── queue/                        ← BullMQ global
│   │   │   └── processors/               ← message-inbound, ai-response, email
│   │   ├── prisma/                       ← PrismaService (inyectable)
│   │   └── health/                       ← /health
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/                   ← 8 migraciones (2026-04-11 → 2026-04-19)
├── docker/                               ← Dockerfile multistage
├── docker-compose.yml                    ← stack completo de dev
└── scripts/                              ← setup.sh, migrate.sh, seed.sh
```

**Convención importante:** los módulos están organizados **por feature**, no por capa técnica. Cada carpeta en `modules/` contiene su `*.controller.ts`, `*.service.ts`, `*.module.ts` y `dto/`.

---

## 3. Modelo de datos — las 12 tablas

El schema define **12 modelos** agrupados en 7 bloques lógicos. Todos los IDs son UUID (`String @id @default(uuid())`) y todas las tablas tienen `createdAt`/`updatedAt` salvo las de auditoría.

### 3.1 Multitenancy — el raíz de todo

**Tenant** (`api/prisma/schema.prisma` L14-L34) es la **entidad raíz**. Representa una organización cliente. Cualquier otra entidad del dominio (usuarios, canales, contactos, conversaciones, configs de IA, archivos) cuelga de un `tenantId`. Esto garantiza el aislamiento multitenant: una query sin `tenantId` en el `where` es un bug.

Campos clave: `plan` (FREE/STARTER/PRO/ENTERPRISE), `slug` único, `settings` JSON libre, `deletedAt` (soft-delete).

### 3.2 Usuarios (agentes internos)

**User** (L47-L70) representa a los miembros del equipo del tenant — NO a los clientes finales (esos son `Contact`).

- `role`: `OWNER | ADMIN | AGENT` (jerárquico)
- Email verification: `emailVerified`, `verificationTokenHash` (único), `verificationTokenExpiresAt`
- Soft-delete con `deletedAt`
- Unique parcial: `(tenantId, email)` donde `deletedAt IS NULL` → mismo email reutilizable si el user se "borra"

**PasswordResetToken** (L72-L87) — tabla separada para tokens de reseteo. Guarda `tokenHash` (nunca el plaintext), `expiresAt`, `usedAt`, `ipAddress`, `userAgent` (audit trail).

### 3.3 Canales (puntos de entrada)

**Channel** (L99-L121) es una instancia configurada de un proveedor de mensajería.

- `type`: `WHATSAPP | INSTAGRAM | MESSENGER | TELEGRAM | WEBCHAT`
- `provider`: `META | EVOLUTION` (WhatsApp puede venir por API oficial de Meta o por Evolution API self-hosted)
- `credentials` es JSON **encriptado** en aplicación con `ENCRYPTION_KEY` — contiene tokens, API keys, etc.
- `webhookSecret` para validar firmas de webhooks entrantes
- Soft-delete + unique parcial `(tenantId, type, provider, name)`

### 3.4 Contactos (clientes finales)

**Contact** (L140-L163) es el usuario externo que escribe al tenant (ej: un cliente escribiendo por WhatsApp).

- `externalId` es el ID del contacto **en la plataforma original** (ej: número de teléfono en WhatsApp, ID de Telegram). Junto con `channelType` y `tenantId` forma el índice único → garantiza deduplicación: un mismo número no se duplica entre webhooks.
- `tags` (array de strings), `metadata` (JSON libre).
- Tracking temporal: `firstContactAt`, `lastContactAt`.

### 3.5 Conversaciones (threads de chat)

**Conversation** (L169-L196) une un `Contact` con un `Channel` dentro de un `Tenant`. Es el agregado central del dominio.

- `status`: `ACTIVE | WAITING_HUMAN | CLOSED | ARCHIVED` — máquina de estados del thread.
- `assignedToId` → `User?`: un agente humano asignado (relación nombrada `"AssignedAgent"`).
- `aiEnabled` (boolean): si está en `true`, los mensajes entrantes disparan procesamiento con IA; si `false`, esperan intervención humana (estado típico `WAITING_HUMAN`).
- `lastMessageAt` indexado → permite ordenar la bandeja por recencia.

### 3.6 Mensajes

**Message** (L209-L241) es cada mensaje individual en una conversación.

- `direction`: `INBOUND` (entrante, del contacto) o `OUTBOUND` (saliente, de la IA o del agente).
- `contentType`: `TEXT | IMAGE | AUDIO | VIDEO | DOCUMENT | LOCATION | STICKER | REACTION | TEMPLATE`.
- Media: `mediaUrl`, `mediaMimeType`, `transcription` (para audio/video), `mediaProcessingStatus` (`PENDING | PROCESSING | COMPLETED | SKIPPED | FAILED`).
- `status`: máquina de estados del envío — `RECEIVED → PROCESSING → PROCESSED → SENT → DELIVERED → READ` (o `FAILED`).
- `externalId` (ID del mensaje en la plataforma externa) + **unique `(channelId, externalId)`** → **idempotencia de webhooks**: si el mismo mensaje llega dos veces, no se duplica.
- `replyToId` apunta a otro `Message` (auto-referencia para "responder a un mensaje") pero **NO tiene FK** en Prisma — es referencia lógica.
- `aiProcessed` (boolean) se usa para batching: el worker de IA toma todos los mensajes no procesados al despertar del debounce.
- `rawPayload` guarda el JSON original del canal para debugging.

### 3.7 Configuración de IA

**AiContext** (L282-L317) es la "personalidad" de la IA para un tenant. Un tenant puede tener varios pero solo uno activo a la vez típicamente.

- `systemPrompt`, `personality`, `language` (default "es")
- `provider` + `model` + `apiKey` + `apiBaseUrl` → permite usar cualquier proveedor (incluso self-hosted con `CUSTOM`)
- `maxTokens`, `memoryWindowSize` (cuántas entradas de memoria enviar como contexto)
- **Debounce** (clave arquitectural): `debounceSeconds` (default 8) y `debounceMaxWaitSeconds` (default 60). Si el contacto envía varios mensajes seguidos, el sistema espera a que "termine de hablar" antes de procesarlos en lote → una sola respuesta coherente.
- Media processor separado: `mediaProcessorProvider` + model + key. Ej: chat con OpenAI pero transcripción con Gemini (más barato).
- `allowedMediaTypes` (array de `ContentType`): qué tipos acepta procesar; el resto → `fallbackMessage` / `unsupportedMediaMessage`.

**ContextFile** (L330-L352) — archivos subidos que alimentan el contexto (documentos, PDFs, etc). Campos `storageKey`, `embeddingId`, `chunkCount`, `status` → preparado para RAG (aunque el RAG en sí no está implementado todavía).

### 3.8 Memoria de conversación

**AiMemoryEntry** (L365-L380) guarda el historial que se envía a la IA.

- `role`: `USER | ASSISTANT | SYSTEM | SUMMARY`
- `tokenCount` para contabilidad de costo
- `isActive` permite "desactivar" entradas viejas sin borrarlas (útil para summarization: se reemplazan N entradas viejas por una entry con `role=SUMMARY`)
- Índice `(conversationId, isActive, createdAt)` → query típica: "dame las últimas N entradas activas"

### 3.9 Auditoría

**ActionLog** (L393-L407) — registra acciones ejecutadas por la IA u otros procesos (ej: "IA respondió", "mensaje fallido"). `status: PENDING | SUCCESS | FAILED`. **Sin FKs** (referencias lógicas a `tenantId`/`conversationId`) → asegura que no se pierde el log si se borran los datos relacionados.

**WebhookLog** (L419-L432) — snapshot crudo de webhooks entrantes (rawPayload, headers, sourceIp). Aislado del resto del modelo para debugging de integraciones.

---

## 4. Mapa de relaciones

```
                            ┌──────────┐
                            │  Tenant  │  (raíz multitenant)
                            └────┬─────┘
                                 │ CASCADE
      ┌──────────┬──────────┬────┴──────┬──────────────┬───────────────┐
      ▼          ▼          ▼           ▼              ▼               ▼
   ┌─────┐  ┌────────┐  ┌─────────┐  ┌──────────────┐  ┌───────────┐  ┌─────────────┐
   │User │  │Channel │  │Contact  │  │ Conversation │  │ AiContext │  │ ContextFile │
   └──┬──┘  └───┬────┘  └────┬────┘  └──────┬───────┘  └─────┬─────┘  └──────┬──────┘
      │        │            │              │                │               │
      │        │            │              │   ┌────────────┘               │
      │        │            │              │   │  CASCADE                   │
      │        │            │              │   ▼                            │
      │        │            │              │ (padre de ContextFile) ────────┘
      │        │            │              │
      │ CASCADE│            │              │
      ▼        │            │              │
  ┌────────────┴────┐       │              │
  │PasswordResetTok │       │              │
  └─────────────────┘       │              │
                            │              │
         ┌──────────────────┴──────────────┤
         │ Conversation referencia:        │
         │   channelId  → Channel (RESTRICT)
         │   contactId  → Contact (RESTRICT)
         │   assignedToId → User   (SET NULL, relación "AssignedAgent")
         │                                 │
                                           │ CASCADE
                          ┌────────────────┴────────────┐
                          ▼                             ▼
                     ┌─────────┐                 ┌───────────────┐
                     │ Message │                 │ AiMemoryEntry │
                     └────┬────┘                 └───────────────┘
                          │
                          │  channelId → Channel (RESTRICT)
                          │  replyToId → Message (self, SIN FK)
                          ▼
                (único: channelId + externalId → idempotencia)


Tablas aisladas (sin FKs):
  ┌────────────┐   ┌─────────────┐
  │ ActionLog  │   │ WebhookLog  │
  └────────────┘   └─────────────┘
  (referencias lógicas a tenantId / conversationId / channelType)
```

**Lectura del grafo:**

- **Todo cuelga de `Tenant`** con `onDelete: Cascade` → borrar un tenant limpia sus datos.
- **`Conversation` es el nudo central**: cruza Tenant + Channel + Contact + (opcionalmente) User asignado. Sus FKs hacia Channel/Contact son `RESTRICT` → no puedes borrar un canal o contacto si tiene conversaciones (se protege historial).
- **`Message` vive bajo `Conversation`** (CASCADE) pero referencia a `Channel` directamente (para queries por canal sin saltar conversación).
- **`AiMemoryEntry` es paralelo a `Message`** pero con forma específica para LLMs (role USER/ASSISTANT/SYSTEM/SUMMARY). Son dos "líneas del tiempo" del mismo thread: una literal (Message) y una para IA (AiMemoryEntry, potencialmente resumida).
- **Idempotencia**: `Message.unique(channelId, externalId)` evita duplicar mensajes al reenvío de webhooks. `Contact.unique(tenantId, externalId, channelType)` deduplica contactos.
- **Soft-delete** en 4 entidades (Tenant, User, Channel, AiContext) con `deletedAt` + índices parciales en los únicos → permite borrar-reusar-nombres sin colisiones.

---

## 5. Capas de la aplicación

### 5.1 Pipeline de una request HTTP autenticada

```
Request → Helmet/CORS → ValidationPipe (whitelist, transform)
       → JwtAuthGuard (Passport JWT valida token)
       → TenantGuard (asegura tenantId en el JWT)
       → RolesGuard (si aplica @Roles('OWNER'))
       → Controller
          @CurrentTenant() extrae tenantId
          @CurrentUser() extrae payload
       → Service (lógica)
       → Prisma (filtra por tenantId SIEMPRE)
       → TransformInterceptor (envuelve: { success, data })
       → LoggingInterceptor (pino)
       → HttpExceptionFilter (normaliza errores)
```

**Decoradores y guards clave:** `api/src/common/decorators/`, `api/src/common/guards/`.

### 5.2 Grupos de endpoints

| Prefijo | Módulo | Endpoints principales |
|---|---|---|
| `/api/auth` | auth | register, login, refresh, me, verify-email, resend-verification, forgot-password, reset-password, change-password |
| `/api/tenants` | tenants | GET/PATCH `/me` (PATCH solo OWNER) |
| `/api/channels` | channels | CRUD + soft-delete; GET devuelve credenciales desencriptadas |
| `/api/contacts` | contacts | CRUD |
| `/api/conversations` | conversations | list/detail/patch (status, assignedTo, aiEnabled) |
| `/api/messages` | messages | list/detail (solo lectura — ver ⚠ más abajo) |
| `/api/ai-contexts` | ai-context | CRUD |
| `/webhooks/:channelType/:channelId` | webhooks | GET (verificación Meta) + POST (inbound) — **sin prefijo `/api`** |

⚠ **Gap conocido (ROADMAP.md ~65%):** no existe aún `POST /api/conversations/:id/messages` para que un agente humano responda desde la app. Es el bloqueante principal del MVP. Tampoco hay WebSockets — el cliente hace polling.

### 5.3 Pipeline asíncrono de mensajes (lo más interesante)

El backend desacopla recepción de procesamiento con **BullMQ** (Redis). Tres colas:

| Cola | Processor | Dispara |
|---|---|---|
| `message-inbound` | `MessageInboundProcessor` | Lo encola el webhook |
| `ai-response` | `AiResponseProcessor` | Lo encola `message-inbound` con delay (debounce) |
| `email` | `EmailProcessor` | Lo encola `AuthService` (verification/reset) |

**Flujo completo de un mensaje entrante:**

```
1) POST /webhooks/whatsapp/:channelId  (Meta o Evolution)
       │
       ▼
   WebhooksController
   ├─ Valida firma con channel.webhookSecret
   ├─ AdapterFactory.get(type, provider).normalizeInbound(rawPayload)
   │      → NormalizedMessage { externalId, senderId, content, contentType, mediaUrl, … }
   └─ Encola en 'message-inbound'
       │
       ▼
2) MessageInboundProcessor (worker)
   ├─ ContactResolver: upsert Contact por (tenantId, externalId, channelType)
   ├─ ConversationResolver: upsert Conversation (ACTIVE por defecto) o reabrir si CLOSED
   ├─ MessagePersister: crea Message(direction=INBOUND, status=RECEIVED, aiProcessed=false)
   │      (si ya existe por unique(channelId,externalId) → idempotente, no-op)
   ├─ Si message.contentType es media → MediaProcessor encola o procesa (transcription/OCR)
   └─ Si conversation.aiEnabled y tenant tiene AiContext activo:
         calcula delayMs = min(debounceSeconds*1000,
                               oldestPending.createdAt + debounceMaxWaitSeconds*1000 − now)
         encola 'ai-response' { conversationId } con ese delay
       │
       ▼  (espera debounce — agrupa mensajes consecutivos)
3) AiResponseProcessor
   ├─ Carga mensajes pendientes (aiProcessed=false, direction=INBOUND)
   ├─ AiMemoryService: últimas memoryWindowSize entries activas
   ├─ Construye prompt: systemPrompt + personality + memory + nuevos mensajes
   ├─ Provider (openai/anthropic/gemini/custom).chat(...)
   ├─ Crea AiMemoryEntry(USER…) por cada input y AiMemoryEntry(ASSISTANT, tokenCount)
   ├─ Marca mensajes procesados: aiProcessed=true, status=PROCESSED
   ├─ ResponseDispatcher.dispatch(conversationId, texto)
   │      └─ SenderFactory.get(channel).send(...)  → HTTP al proveedor (Meta/Evolution/Telegram)
   ├─ Crea Message(direction=OUTBOUND, status=SENT, externalId=respuesta)
   └─ ActionLog(status=SUCCESS|FAILED, payload, result)
```

**Patrones que se repiten en esta capa:**

- **Adapter**: cada canal externo tiene su propio parser en `api/src/modules/webhooks/adapters/` que normaliza a una forma común.
- **Factory**: `AdapterFactory` y `SenderFactory` seleccionan la implementación según `(type, provider)`.
- **Strategy**: `AiEngineService` delega en el provider configurado (OpenAI/Anthropic/Gemini/Custom).
- **Pipeline steps**: `api/src/modules/message-pipeline/steps/` encapsulan cada paso (resolver contact, resolver conversation, persistir mensaje) como unidades reutilizables.

---

## 6. Seguridad

- **JWT Bearer** en todas las rutas privadas; payload lleva `sub` (userId), `tenantId`, `role`, `email`.
- **TenantGuard** garantiza que cada servicio reciba el `tenantId` y filtre queries — es la defensa del aislamiento multitenant.
- **`bcrypt`** para `passwordHash`. **`tokenHash`** (SHA-256) para verification y reset tokens — nunca se guarda plaintext.
- **`ENCRYPTION_KEY`** encripta `Channel.credentials` en reposo (AES-GCM).
- **`ValidationPipe`** global con `whitelist: true, forbidNonWhitelisted: true` → rechaza campos no declarados en los DTOs.
- **Rate limiting** global: 100 req/60s (ThrottlerModule).
- **Helmet + CORS** configurables por env.
- **Webhook signature verification** en el controller antes de encolar.

---

## 7. Cómo lo correrías y lo verificarías

1. `cp .env.example .env` y llenar secretos (o `scripts/setup.sh` los genera).
2. `docker compose up -d` → levanta postgres, redis, mailhog (UI en `:8025`), evolution-api, api.
3. La api aplica migraciones al arranque (`entrypoint.dev.sh` ejecuta `prisma migrate deploy`).
4. Swagger en `http://localhost:3000/api/docs`.
5. Health en `http://localhost:3000/health`.
6. Para probar el pipeline end-to-end sin WhatsApp real: hacer POST a `/webhooks/webchat/:channelId` con un payload normalizado y ver el Message persistido + la respuesta OUTBOUND.

---

## 8. Puntos a tener presentes al trabajar con este backend

- **Nunca hagas una query de Prisma sin `tenantId`** — rompes el aislamiento multitenant.
- **Nunca borres hard donde hay `deletedAt`** — usa soft-delete.
- **No asumas `replyToId` como FK** — es referencia lógica; valida manualmente si la usas.
- **Idempotencia de mensajes** depende de `externalId` del canal: si un adapter no lo extrae bien, tendrás duplicados.
- **El debounce es por tenant/conversation**: no programes tareas que asuman respuesta inmediata tras webhook.
- **Dos timelines en paralelo**: `Message` (lo que pasó literal) y `AiMemoryEntry` (lo que la IA "recuerda", eventualmente resumido). No los confundas.
- **Gap del MVP**: falta el endpoint humano para responder desde el panel (`POST /api/conversations/:id/messages`) y WebSockets/realtime.
