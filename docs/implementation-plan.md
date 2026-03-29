# Plan de implementación — m2-back (Backend NestJS)

## Contexto del proyecto

### Objetivo
Construir un backend NestJS dentro del monorepo `m2-back` que centralice chats de WhatsApp, Instagram, Messenger, Telegram y otros canales, procesándolos con asistentes de IA configurables por cliente (multitenancy).

### Estado actual del repositorio
El repo `m2-back` ya contiene un `docker-compose.yml` que levanta:
- **PostgreSQL 16** (con DBs para n8n y evolution)
- **n8n** (automatización de workflows)
- **Evolution API** (API de WhatsApp)
- **Redis** (cache para Evolution)

No hay código de aplicación. El backend NestJS se integrará como un servicio más en este monorepo.

### Enfoque: Monorepo
Todo el código NestJS vivirá en una carpeta `api/` en la raíz del repo. Se agregará como servicio al `docker-compose.yml` existente.

### Stack tecnológico
- **Runtime**: Node.js 20+ / NestJS 10+
- **ORM**: Prisma (PostgreSQL)
- **Base de datos**: PostgreSQL 16 (ya existente en docker-compose)
- **Cache/Colas**: Redis (ya existente) + BullMQ
- **Storage de archivos**: S3-compatible (o local en desarrollo)
- **Autenticación**: JWT (access + refresh tokens)
- **Validación**: class-validator + class-transformer
- **Documentación API**: Swagger (@nestjs/swagger)

---

## Estructura de carpetas objetivo

```
m2-back/
├── .git/
├── .gitignore                          # Global: .env*, node_modules, dist, uploads
├── .env.example                        # Template de variables (sin valores reales)
├── .env                                # Variables reales (ignorado por git)
├── CLAUDE.md                           # Instrucciones para el agente de desarrollo
├── README.md                           # Documentación general del proyecto
│
├── docs/                               # Documentación del proyecto
│   ├── implementation-plan.md          # Plan de implementación por fases
│   ├── project-structure.md            # Descripción de la estructura del repo
│   ├── database-schema.md             # Documentación de campos de BD
│   └── api-conventions.md              # Convenciones de la API REST
│
├── docker/                             # Todo lo relacionado a Docker
│   ├── api/
│   │   └── Dockerfile                  # Build del backend NestJS (multi-stage)
│   ├── postgres/
│   │   └── init-db.sh                  # Crea las DBs: n8n_db, evolution_db, m2_api
│   └── redis/
│       └── redis.conf                  # Config custom de Redis (opcional)
│
├── docker-compose.yml                  # Orquestación de TODOS los servicios
├── docker-compose.override.yml         # Overrides para desarrollo (hot-reload, debug)
│
├── scripts/                            # Scripts utilitarios
│   ├── setup.sh                        # Setup inicial: copia .env.example → .env, genera secretos
│   ├── seed.sh                         # Ejecuta prisma seed dentro del container api
│   └── migrate.sh                      # Ejecuta prisma migrate dentro del container api
│
└── api/                                # Backend NestJS
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.build.json
    ├── nest-cli.json
    ├── .eslintrc.js
    ├── .prettierrc
    ├── prisma/
    │   ├── schema.prisma
    │   ├── seed.ts
    │   └── migrations/
    └── src/
        ├── main.ts
        ├── app.module.ts
        ├── config/
        ├── common/
        ├── modules/
        │   ├── webhooks/
        │   ├── message-pipeline/
        │   ├── ai-engine/
        │   ├── ai-memory/
        │   ├── ai-context/
        │   ├── actions/
        │   ├── response-dispatcher/
        │   ├── messages/
        │   ├── conversations/
        │   ├── contacts/
        │   ├── tenants/
        │   ├── channels/
        │   └── auth/
        ├── queue/
        └── shared/
```

> **Nota**: El Dockerfile del API vive en `docker/api/Dockerfile`, NO dentro de `api/`. Los archivos de Docker se centralizan en `docker/`. Las credenciales se manejan via `.env` (nunca hardcodeadas en docker-compose.yml). El `docker-compose.override.yml` se aplica automáticamente en desarrollo y agrega hot-reload al servicio api.

---

## Esquema de base de datos (Prisma)

Usar exactamente este schema en `api/prisma/schema.prisma`. Este es el esquema **aprobado y final**.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// =====================================================
// MULTITENANCY
// =====================================================

model Tenant {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  plan        Plan     @default(FREE)
  isActive    Boolean  @default(true)
  settings    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users         User[]
  channels      Channel[]
  contacts      Contact[]
  conversations Conversation[]
  aiContexts    AiContext[]
  contextFiles  ContextFile[]

  @@map("tenants")
}

enum Plan {
  FREE
  STARTER
  PRO
  ENTERPRISE
}

// =====================================================
// USUARIOS
// =====================================================

model User {
  id           String   @id @default(uuid())
  tenantId     String
  email        String
  passwordHash String
  name         String
  role         UserRole @default(AGENT)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  assignedConversations Conversation[] @relation("AssignedAgent")

  @@unique([tenantId, email])
  @@map("users")
}

enum UserRole {
  OWNER
  ADMIN
  AGENT
}

// =====================================================
// CANALES
// =====================================================

model Channel {
  id           String        @id @default(uuid())
  tenantId     String
  type         ChannelType
  name         String
  credentials  Json
  webhookSecret String?
  isActive     Boolean       @default(true)
  metadata     Json?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  conversations Conversation[]
  messages     Message[]

  @@unique([tenantId, type, name])
  @@index([tenantId, type])
  @@map("channels")
}

enum ChannelType {
  WHATSAPP
  INSTAGRAM
  MESSENGER
  TELEGRAM
  WEBCHAT
}

// =====================================================
// CONTACTOS
// =====================================================

model Contact {
  id              String   @id @default(uuid())
  tenantId        String
  externalId      String
  channelType     ChannelType
  name            String?
  phone           String?
  email           String?
  avatarUrl       String?
  metadata        Json?
  tags            String[]
  firstContactAt  DateTime @default(now())
  lastContactAt   DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  conversations   Conversation[]

  @@unique([tenantId, externalId, channelType])
  @@index([tenantId, phone])
  @@index([tenantId, email])
  @@map("contacts")
}

// =====================================================
// CONVERSACIONES
// =====================================================

model Conversation {
  id            String             @id @default(uuid())
  tenantId      String
  channelId     String
  contactId     String
  status        ConversationStatus @default(ACTIVE)
  assignedToId  String?
  aiEnabled     Boolean            @default(true)
  subject       String?
  metadata      Json?
  lastMessageAt DateTime           @default(now())
  closedAt      DateTime?
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  tenant        Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  channel       Channel      @relation(fields: [channelId], references: [id])
  contact       Contact      @relation(fields: [contactId], references: [id])
  assignedTo    User?        @relation("AssignedAgent", fields: [assignedToId], references: [id])
  messages      Message[]
  memoryEntries AiMemoryEntry[]

  @@index([tenantId, status])
  @@index([tenantId, channelId])
  @@index([contactId])
  @@index([lastMessageAt])
  @@map("conversations")
}

enum ConversationStatus {
  ACTIVE
  WAITING_HUMAN
  CLOSED
  ARCHIVED
}

// =====================================================
// MENSAJES
// =====================================================

model Message {
  id               String        @id @default(uuid())
  conversationId   String
  channelId        String
  direction        MessageDirection
  content          String
  contentType      ContentType   @default(TEXT)
  mediaUrl         String?
  mediaMimeType    String?
  externalId       String?
  replyToId        String?
  rawPayload       Json?
  sanitizedContent String?
  metadata         Json?
  status           MessageStatus @default(RECEIVED)
  aiProcessed      Boolean       @default(false)
  errorMessage     String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  conversation     Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  channel          Channel       @relation(fields: [channelId], references: [id])

  @@index([conversationId, createdAt])
  @@index([channelId, direction])
  @@index([externalId])
  @@index([createdAt])
  @@map("messages")
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum ContentType {
  TEXT
  IMAGE
  AUDIO
  VIDEO
  DOCUMENT
  LOCATION
  STICKER
  REACTION
  TEMPLATE
}

enum MessageStatus {
  RECEIVED
  PROCESSING
  PROCESSED
  SENT
  DELIVERED
  READ
  FAILED
}

// =====================================================
// CONTEXTO DE IA
// =====================================================

model AiContext {
  id              String   @id @default(uuid())
  tenantId        String
  name            String
  systemPrompt    String
  personality     String?
  language        String   @default("es")
  provider        AiProvider @default(OPENAI)
  model           String   @default("gpt-4o-mini")
  maxTokens       Int      @default(1000)
  memoryWindowSize Int     @default(20)
  isActive        Boolean  @default(true)
  fallbackMessage String?
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contextFiles    ContextFile[]

  @@index([tenantId, isActive])
  @@map("ai_contexts")
}

enum AiProvider {
  OPENAI
  ANTHROPIC
  CUSTOM
}

// =====================================================
// ARCHIVOS DE CONTEXTO
// =====================================================

model ContextFile {
  id            String   @id @default(uuid())
  tenantId      String
  aiContextId   String
  fileName      String
  fileType      String
  fileSize      Int
  storageKey    String
  storageUrl    String?
  content       String?
  embeddingId   String?
  chunkCount    Int      @default(0)
  status        FileStatus @default(UPLOADING)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant        Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  aiContext     AiContext  @relation(fields: [aiContextId], references: [id], onDelete: Cascade)

  @@index([aiContextId])
  @@index([tenantId])
  @@map("context_files")
}

enum FileStatus {
  UPLOADING
  PROCESSING
  READY
  FAILED
}

// =====================================================
// MEMORIA DE IA
// =====================================================

model AiMemoryEntry {
  id              String   @id @default(uuid())
  conversationId  String
  role            MemoryRole
  content         String
  tokenCount      Int?
  summary         String?
  isActive        Boolean  @default(true)
  metadata        Json?
  createdAt       DateTime @default(now())

  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, isActive, createdAt])
  @@map("ai_memory_entries")
}

enum MemoryRole {
  USER
  ASSISTANT
  SYSTEM
  SUMMARY
}

// =====================================================
// LOGS DE ACCIONES
// =====================================================

model ActionLog {
  id            String     @id @default(uuid())
  tenantId      String
  conversationId String?
  actionType    String
  payload       Json?
  result        Json?
  status        ActionStatus @default(PENDING)
  errorMessage  String?
  executedAt    DateTime   @default(now())

  @@index([tenantId, actionType])
  @@index([conversationId])
  @@map("action_logs")
}

enum ActionStatus {
  PENDING
  SUCCESS
  FAILED
}

// =====================================================
// WEBHOOK LOGS
// =====================================================

model WebhookLog {
  id          String   @id @default(uuid())
  channelType ChannelType
  rawPayload  Json
  headers     Json?
  sourceIp    String?
  processed   Boolean  @default(false)
  errorMessage String?
  receivedAt  DateTime @default(now())

  @@index([channelType, receivedAt])
  @@index([processed])
  @@map("webhook_logs")
}
```

---

## Fases de implementación

---

### FASE 0 — Scaffolding y Docker (estimado: 1 sesión)

**Objetivo**: Proyecto NestJS funcional corriendo en Docker junto a los servicios existentes.

**Tareas**:

1. Crear las carpetas `api/`, `docs/`, `docker/api/`, `docker/postgres/`, `docker/redis/`, `scripts/` en la raíz del monorepo.
2. Inicializar proyecto NestJS dentro de `api/`:
   - `nest new . --package-manager npm --skip-git`
   - Instalar dependencias core: `@nestjs/config`, `@nestjs/swagger`, `@prisma/client`, `prisma`, `class-validator`, `class-transformer`.
3. Crear `docker/api/Dockerfile` (multi-stage build: base → development → build → production).
4. Crear `api/.dockerignore` (node_modules, dist, .env).
5. Crear `.env.example` con todas las variables documentadas. Crear `scripts/setup.sh` que copie `.env.example` → `.env` y genere secretos automáticamente.
6. Actualizar `docker-compose.yml` para:
   - Reemplazar credenciales hardcodeadas por variables de entorno (`${POSTGRES_USER}`, `${POSTGRES_PASSWORD}`, etc.).
   - Agregar el servicio `api` (build desde `./api`, Dockerfile en `docker/api/Dockerfile`, depende de postgres + redis, puerto configurable via `${API_PORT}`).
   - Agregar volumen `redis_storage` y `api_uploads`.
7. Crear `docker-compose.override.yml` para desarrollo (hot-reload: monta `./api/src` y `./api/prisma`, ejecuta `npm run start:dev`).
8. Mover `init-db.sh` a `docker/postgres/init-db.sh` y actualizarlo para crear las 3 DBs: `n8n_db`, `evolution_db`, `m2_api`. Actualizar la referencia en docker-compose.yml.
9. Crear `scripts/migrate.sh` y `scripts/seed.sh` para ejecutar comandos Prisma dentro del container.
10. Mover `implementation-plan.md` y `project-structure.md` a `docs/`.
11. Actualizar `.gitignore` para cubrir: `.env*`, `node_modules/`, `dist/`, `uploads/`, `coverage/`, archivos de IDE.
12. Configurar Prisma:
    - Copiar el schema.prisma proporcionado arriba en `api/prisma/schema.prisma`.
    - `npx prisma migrate dev --name init` para generar la migración inicial.
    - `npx prisma generate` para generar el cliente.
13. Crear `api/src/prisma/prisma.module.ts` y `api/src/prisma/prisma.service.ts` (servicio global que expone PrismaClient).
14. Configurar `api/src/config/`:
    - `config.module.ts` usando `@nestjs/config` con `ConfigModule.forRoot()`.
    - `database.config.ts` — lee DATABASE_URL.
    - `redis.config.ts` — lee REDIS_HOST, REDIS_PORT.
15. Configurar Swagger en `main.ts`.
16. Crear endpoint de health check: `GET /health` que retorne `{ status: 'ok', timestamp }`.
17. Verificar que `docker compose up` levante todos los servicios (postgres, redis, n8n, evolution, api) y que `GET /health` responda.

**Criterio de éxito**: `docker compose up` levanta todo. `curl http://localhost:3000/health` responde OK. `prisma studio` muestra las tablas vacías. Las credenciales hardcodeadas ya no existen en docker-compose.yml (todo via `.env`).

**Archivos resultantes**:
```
m2-back/
├── .env.example
├── .env
├── .gitignore
├── docker-compose.yml          (actualizado)
├── docker-compose.override.yml (nuevo)
├── docs/
│   ├── implementation-plan.md  (movido)
│   └── project-structure.md    (movido)
├── docker/
│   ├── api/
│   │   └── Dockerfile
│   └── postgres/
│       └── init-db.sh          (movido y actualizado)
├── scripts/
│   ├── setup.sh
│   ├── migrate.sh
│   └── seed.sh
└── api/
    ├── .dockerignore
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.build.json
    ├── nest-cli.json
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    └── src/
        ├── main.ts
        ├── app.module.ts
        ├── prisma/
        │   ├── prisma.module.ts
        │   └── prisma.service.ts
        └── config/
            ├── config.module.ts
            ├── database.config.ts
            └── redis.config.ts
```

---

### FASE 1 — Common, Auth y módulos CRUD base (estimado: 2-3 sesiones)

**Objetivo**: Guards, pipes, filtros reutilizables. Autenticación JWT. CRUDs de Tenants, Users, Channels, Contacts, Conversations, Messages.

**Tareas**:

**1.1 — Common (infraestructura transversal)**

Crear `api/src/common/` con:

- `guards/api-key.guard.ts` — Valida API key en header `x-api-key` contra la tabla tenants/channels.
- `guards/tenant.guard.ts` — Extrae `tenantId` del JWT o header y lo inyecta en el request. Todos los queries deben filtrar por tenantId.
- `decorators/tenant.decorator.ts` — `@CurrentTenant()` extrae tenantId del request.
- `decorators/user.decorator.ts` — `@CurrentUser()` extrae user del JWT.
- `interceptors/transform.interceptor.ts` — Envuelve respuestas en formato estándar: `{ success: true, data, meta }`.
- `interceptors/logging.interceptor.ts` — Loguea method, path, status, tiempo de respuesta.
- `filters/http-exception.filter.ts` — Captura excepciones y retorna formato estándar: `{ success: false, error, statusCode }`.
- `pipes/message-validation.pipe.ts` — Pipe global de validación con class-validator.
- `dto/pagination.dto.ts` — DTO reutilizable con `page`, `limit`, `sortBy`, `sortOrder`.
- `dto/api-response.dto.ts` — Tipado de la respuesta estándar.
- `interfaces/normalized-message.interface.ts` — Interfaz del mensaje normalizado que sale del webhook y entra al pipeline:
  ```typescript
  interface NormalizedMessage {
    externalId: string;
    channelType: ChannelType;
    senderId: string;       // externalId del contacto
    senderName?: string;
    content: string;
    contentType: ContentType;
    mediaUrl?: string;
    mediaMimeType?: string;
    replyToExternalId?: string;
    timestamp: Date;
    rawPayload: any;
  }
  ```
- `interfaces/channel-adapter.interface.ts`:
  ```typescript
  interface IChannelAdapter {
    validateSignature(headers: any, body: any, secret: string): boolean;
    normalizeIncoming(payload: any): NormalizedMessage[];
    isStatusUpdate(payload: any): boolean;
  }
  ```

**1.2 — Módulo Auth**

Crear `api/src/modules/auth/`:

- `auth.module.ts`, `auth.controller.ts`, `auth.service.ts`.
- `strategies/jwt.strategy.ts` — Passport JWT strategy. El payload del token contiene: `{ sub: userId, tenantId, role }`.
- `guards/jwt-auth.guard.ts` — Guard global que protege rutas.
- `guards/roles.guard.ts` — Guard de roles con decorador `@Roles('ADMIN', 'OWNER')`.
- `dto/login.dto.ts` — `{ email, password }`.
- `dto/register.dto.ts` — `{ email, password, name, tenantSlug }` (el primer registro crea el tenant + user OWNER).
- Endpoints:
  - `POST /auth/register` — Crea tenant + user OWNER. Retorna JWT.
  - `POST /auth/login` — Valida credenciales. Retorna access token + refresh token.
  - `POST /auth/refresh` — Renueva access token con refresh token.
  - `GET /auth/me` — Retorna user actual con su tenant.
- Usar `bcrypt` para hashear passwords.
- Los refresh tokens se guardan en Redis con TTL de 7 días.

**1.3 — Módulo Tenants**

Crear `api/src/modules/tenants/`:

- CRUD completo. Solo accesible por OWNER del tenant.
- Endpoints:
  - `GET /tenants/me` — Info del tenant actual.
  - `PATCH /tenants/me` — Actualizar nombre, settings.
- DTOs con validación: `update-tenant.dto.ts`.

**1.4 — Módulo Channels**

Crear `api/src/modules/channels/`:

- CRUD de canales del tenant.
- Endpoints:
  - `POST /channels` — Conectar un nuevo canal. Body: `{ type, name, credentials }`.
  - `GET /channels` — Listar canales del tenant.
  - `GET /channels/:id` — Detalle de un canal.
  - `PATCH /channels/:id` — Actualizar canal.
  - `DELETE /channels/:id` — Desconectar canal (soft delete: isActive=false).
- Las `credentials` se deben encriptar antes de guardar en BD (usar crypto AES-256). Crear util en `shared/utils/crypto.util.ts`.
- Al crear un canal, generar automáticamente un `webhookSecret` (crypto.randomBytes).

**1.5 — Módulo Contacts**

Crear `api/src/modules/contacts/`:

- CRUD de contactos del tenant.
- Endpoints:
  - `GET /contacts` — Listar con paginación, búsqueda por nombre/phone/email, filtro por tags.
  - `GET /contacts/:id` — Detalle con sus conversaciones.
  - `PATCH /contacts/:id` — Actualizar info, tags.
  - `DELETE /contacts/:id` — Soft delete o hard delete.
- El contacto se crea automáticamente cuando llega un mensaje de un sender nuevo (esto se implementa en Fase 2), pero también debe poder crearse manualmente.

**1.6 — Módulo Conversations**

Crear `api/src/modules/conversations/`:

- Endpoints:
  - `GET /conversations` — Listar con filtros: status, channelId, assignedToId, contactId. Ordenar por lastMessageAt desc.
  - `GET /conversations/:id` — Detalle con mensajes paginados.
  - `PATCH /conversations/:id` — Cambiar status, asignar agente, toggle aiEnabled.
  - `POST /conversations/:id/close` — Cerrar conversación.
- La conversación se crea automáticamente al llegar un primer mensaje de un contacto en un canal (Fase 2).

**1.7 — Módulo Messages**

Crear `api/src/modules/messages/`:

- Solo lectura desde la API (los mensajes se crean internamente via pipeline).
- Endpoints:
  - `GET /messages?conversationId=X` — Mensajes paginados de una conversación, ordenados por createdAt.
  - `GET /messages/:id` — Detalle de un mensaje con rawPayload.
- DTOs: `query-messages.dto.ts` con filtros de conversationId, direction, contentType, dateRange.

**Criterio de éxito**: Todos los CRUDs funcionan. Swagger documenta todos los endpoints. Auth protege las rutas. Todos los queries filtran por tenantId. Se puede registrar, loguearse, crear canales, y consultar conversaciones/mensajes (vacíos por ahora).

**Archivos resultantes**:
```
src/
├── common/
│   ├── guards/
│   │   ├── api-key.guard.ts
│   │   ├── tenant.guard.ts
│   │   └── roles.guard.ts
│   ├── decorators/
│   │   ├── tenant.decorator.ts
│   │   ├── user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── interceptors/
│   │   ├── transform.interceptor.ts
│   │   └── logging.interceptor.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── pipes/
│   │   └── validation.pipe.ts
│   ├── dto/
│   │   ├── pagination.dto.ts
│   │   └── api-response.dto.ts
│   └── interfaces/
│       ├── normalized-message.interface.ts
│       └── channel-adapter.interface.ts
├── modules/
│   ├── auth/
│   ├── tenants/
│   ├── channels/
│   ├── contacts/
│   ├── conversations/
│   └── messages/
└── shared/
    └── utils/
        └── crypto.util.ts
```

---

### FASE 2 — Webhooks, adaptadores de canal y pipeline de mensajes (estimado: 2-3 sesiones)

**Objetivo**: Recibir webhooks reales de las plataformas, normalizar los mensajes, pasarlos por el pipeline de limpieza y almacenarlos.

**Tareas**:

**2.1 — Módulo Webhooks**

Crear `api/src/modules/webhooks/`:

- `webhooks.controller.ts`:
  - `POST /webhooks/:channelType/:channelId` — Recibe webhooks de cualquier plataforma.
  - `GET /webhooks/:channelType/:channelId` — Para verificación de webhook (WhatsApp y Meta requieren un GET de verificación con challenge).
  - El controlador NO debe tener auth JWT. Los webhooks se validan por firma.
- `webhooks.service.ts` — Orquesta el flujo:
  1. Buscar el canal en BD por channelId.
  2. Loguear en WebhookLog (siempre, antes de procesar).
  3. Usar el adapter correcto para validar la firma.
  4. Verificar si es un status update (delivered, read) → actualizar Message.status y retornar.
  5. Normalizar el payload a NormalizedMessage[].
  6. Para cada mensaje normalizado: encolar en BullMQ para procesamiento async.
  7. Responder 200 inmediatamente (las plataformas tienen timeout de ~15s).

**2.2 — Adaptadores de canal (Strategy Pattern)**

Crear `api/src/modules/webhooks/adapters/`:

- `base.adapter.ts` — Clase abstracta que implementa `IChannelAdapter`.
- `whatsapp.adapter.ts`:
  - Valida firma HMAC-SHA256 con el app secret de Meta.
  - Parsea la estructura de WhatsApp Cloud API: `entry[].changes[].value.messages[]`.
  - Extrae: sender phone, message type, content/media, timestamp, message ID.
  - Detecta status updates: `entry[].changes[].value.statuses[]`.
- `instagram.adapter.ts`:
  - Valida firma HMAC-SHA256 de Meta.
  - Parsea estructura de Instagram Messaging API: `entry[].messaging[]`.
  - Extrae: sender id, message text/attachments, timestamp.
- `messenger.adapter.ts`:
  - Similar a Instagram (ambos usan la plataforma Meta).
  - Parsea: `entry[].messaging[]`.
- `telegram.adapter.ts`:
  - Valida por IP whitelist de Telegram o por secret token en URL.
  - Parsea: `message.from`, `message.text`, `message.photo[]`, etc.
- `adapter.factory.ts`:
  ```typescript
  @Injectable()
  class AdapterFactory {
    getAdapter(channelType: ChannelType): IChannelAdapter {
      switch(channelType) {
        case 'WHATSAPP': return this.whatsappAdapter;
        case 'INSTAGRAM': return this.instagramAdapter;
        // ...
      }
    }
  }
  ```

**2.3 — Cola de mensajes entrantes (BullMQ)**

Crear `api/src/queue/`:

- `queue.module.ts` — Registra las colas con `@nestjs/bullmq`.
- `processors/inbound-message.processor.ts`:
  - Recibe el job con: `{ normalizedMessage, channelId, tenantId }`.
  - Busca o crea el Contact (upsert por externalId + channelType + tenantId).
  - Busca o crea la Conversation (por contactId + channelId, si no hay una ACTIVE, crea una nueva).
  - Actualiza `contact.lastContactAt` y `conversation.lastMessageAt`.
  - Crea el Message en BD con direction=INBOUND, status=RECEIVED.
  - Pasa el mensaje por el pipeline de procesamiento (Fase 2.4).
  - Si `conversation.aiEnabled === true`, encola el mensaje para procesamiento IA (Fase 3).

**2.4 — Pipeline de procesamiento de mensajes**

Crear `api/src/modules/message-pipeline/`:

- `interfaces/pipeline-step.interface.ts`:
  ```typescript
  interface IPipelineStep {
    execute(message: Message, context: PipelineContext): Promise<Message>;
  }
  ```
- `message-pipeline.service.ts` — Ejecuta los pasos en orden. Si un paso falla, loguea y continúa con los demás.
- `steps/sanitizer.step.ts`:
  - Elimina HTML tags, scripts, XSS attempts.
  - Normaliza unicode, emojis, whitespace excesivo.
  - Guarda resultado en `message.sanitizedContent`.
- `steps/deduplicator.step.ts`:
  - Busca en BD si ya existe un mensaje con el mismo `externalId`.
  - Si existe, marca como duplicado y detiene el pipeline.
  - Usa Redis con TTL de 5 minutos para cache rápido de externalIds recientes.
- `steps/enricher.step.ts`:
  - Detecta idioma del mensaje (librería como `franc` o API).
  - Opcionalmente: análisis de sentimiento básico.
  - Guarda en `message.metadata`: `{ language, sentiment, wordCount }`.
- `steps/validator.step.ts`:
  - Valida que el mensaje tenga contenido no vacío.
  - Valida que el contentType sea coherente (si es IMAGE, que tenga mediaUrl).
  - Marca `message.status = PROCESSED` si pasa.

**2.5 — WebhookLog**

- Todo webhook que llega se loguea en `WebhookLog` ANTES de procesarlo.
- Si el procesamiento falla, se marca `processed=false` con el error.
- Crear un cleanup job (cron) que borre logs de más de 30 días.

**Criterio de éxito**: Se puede enviar un POST simulando un webhook de WhatsApp. El sistema loguea, normaliza, crea contacto, conversación y mensaje en BD. El mensaje pasa por el pipeline y queda con status PROCESSED. Los duplicados se detectan.

**Archivos resultantes**:
```
src/
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
│   └── processors/
│       └── inbound-message.processor.ts
└── shared/
    └── utils/
        └── text-cleaner.util.ts
```

---

### FASE 3 — AI Engine, memoria y contexto (estimado: 2-3 sesiones)

**Objetivo**: Procesar mensajes con IA, gestionando contexto configurable por tenant y memoria conversacional.

**Tareas**:

**3.1 — Módulo AI Context (CRUD)**

Crear `api/src/modules/ai-context/`:

- `ai-context.controller.ts`:
  - `POST /ai-contexts` — Crear configuración de IA para el tenant. Body: `{ name, systemPrompt, personality, provider, model, maxTokens, memoryWindowSize, fallbackMessage }`.
  - `GET /ai-contexts` — Listar contextos del tenant.
  - `GET /ai-contexts/:id` — Detalle con sus archivos.
  - `PATCH /ai-contexts/:id` — Actualizar config.
  - `DELETE /ai-contexts/:id` — Eliminar contexto.
- `context-files.controller.ts`:
  - `POST /ai-contexts/:id/files` — Upload de archivo (multipart). Guardar en storage, extraer texto, crear registro.
  - `GET /ai-contexts/:id/files` — Listar archivos del contexto.
  - `DELETE /ai-contexts/:id/files/:fileId` — Eliminar archivo.
- `context-files.service.ts`:
  - Al subir un archivo: guardarlo en storage (S3 o local), extraer texto plano (pdf-parse para PDFs, mammoth para docx, lectura directa para txt/csv), guardar el texto en `ContextFile.content`, marcar status=READY.
  - Si falla la extracción, marcar status=FAILED con error.

**3.2 — Módulo AI Memory**

Crear `api/src/modules/ai-memory/`:

- `ai-memory.service.ts`:
  - `addEntry(conversationId, role, content)` — Crea entrada en AiMemoryEntry. Calcula tokenCount aproximado (chars/4).
  - `getActiveMemory(conversationId, windowSize)` — Retorna las últimas `windowSize` entradas activas, ordenadas por createdAt ASC.
  - `compressMemory(conversationId)` — Cuando hay más entradas activas que el windowSize: toma las más antiguas que sobran, las resume en una sola entrada con role=SUMMARY usando la IA, marca las originales como isActive=false.
- La memoria se guarda en PostgreSQL pero se cachea en Redis (key: `memory:{conversationId}`, TTL: 30 min) para acceso rápido durante la conversación.

**3.3 — Módulo AI Engine**

Crear `api/src/modules/ai-engine/`:

- `context-builder.service.ts` — Arma el contexto completo que se envía a la IA:
  1. Obtener el AiContext del tenant (system prompt, personality, language).
  2. Obtener los ContextFiles activos → concatenar sus `content` como parte del system prompt.
  3. Obtener la memoria activa de la conversación (AiMemoryEntry[]).
  4. Agregar el mensaje nuevo del usuario.
  5. Retornar el array completo de messages listo para enviar al LLM.
- `prompt-builder.service.ts` — Construye el system prompt final:
  ```
  [systemPrompt del AiContext]
  [personality]
  [contenido de archivos de contexto]
  [instrucciones de formato/idioma]
  ```
- `providers/base.provider.ts`:
  ```typescript
  abstract class BaseAiProvider {
    abstract chat(messages: AiMessage[], config: AiConfig): Promise<string>;
  }
  ```
- `providers/openai.provider.ts` — Llama a OpenAI API (gpt-4o-mini, gpt-4o, etc.).
- `providers/anthropic.provider.ts` — Llama a Anthropic API (Claude).
- `providers/provider.factory.ts` — Resuelve el provider según `AiContext.provider`.
- `ai-engine.service.ts` — Orquesta todo:
  1. Recibe un mensaje inbound procesado.
  2. Obtiene el AiContext del tenant.
  3. Llama a contextBuilder para armar el contexto completo.
  4. Llama al provider de IA correspondiente.
  5. Guarda la respuesta como AiMemoryEntry (role=ASSISTANT).
  6. Guarda el mensaje del usuario como AiMemoryEntry (role=USER).
  7. Si la ventana de memoria se excedió, dispara compresión.
  8. Retorna el texto de respuesta.
  9. Si la IA falla: retorna el `fallbackMessage` del AiContext.

**3.4 — Integrar con el processor de mensajes entrantes**

Actualizar `inbound-message.processor.ts` (de Fase 2):
- Después del pipeline de procesamiento, si `conversation.aiEnabled === true`:
  1. Llamar a `aiEngine.processMessage(message, conversation)`.
  2. Crear un Message de salida (direction=OUTBOUND) con la respuesta.
  3. Encolar el mensaje de salida para envío (Fase 4).

**Criterio de éxito**: Un mensaje entrante genera una respuesta de IA automáticamente. La IA usa el system prompt configurado, los archivos de contexto, y la memoria de la conversación. Se puede cambiar el system prompt y la IA cambia de comportamiento.

**Archivos resultantes**:
```
src/modules/
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

### FASE 4 — Response Dispatcher y acciones (estimado: 1-2 sesiones)

**Objetivo**: Enviar las respuestas de la IA de vuelta al canal correcto. Ejecutar acciones extra.

**Tareas**:

**4.1 — Módulo Response Dispatcher**

Crear `api/src/modules/response-dispatcher/`:

- `response-dispatcher.service.ts`:
  - Recibe un Message con direction=OUTBOUND.
  - Obtiene el Channel de la conversación.
  - Usa el sender correcto según channelType.
  - Actualiza message.status (SENT, DELIVERED, FAILED).
- `senders/base.sender.ts`:
  ```typescript
  abstract class BaseSender {
    abstract send(message: Message, channel: Channel, contact: Contact): Promise<SendResult>;
  }
  ```
- `senders/whatsapp.sender.ts` — Envía via WhatsApp Cloud API (`POST /v17.0/{phoneNumberId}/messages`). Soporta text, image, document, template.
- `senders/instagram.sender.ts` — Envía via Instagram Send API.
- `senders/messenger.sender.ts` — Envía via Messenger Send API.
- `senders/telegram.sender.ts` — Envía via Telegram Bot API (`sendMessage`, `sendPhoto`, etc.).
- `queue/processors/outbound-message.processor.ts`:
  - Procesa la cola de mensajes salientes.
  - Retry automático: 3 intentos con backoff exponencial (1s, 5s, 30s).
  - Si falla después de 3 intentos, marca message.status=FAILED con errorMessage.
  - Rate limiting por canal para respetar límites de cada plataforma.

**4.2 — Módulo Actions**

Crear `api/src/modules/actions/`:

- `actions.service.ts` — Router que detecta si la respuesta de la IA requiere una acción extra. Usa un sistema de "action triggers" configurable (palabras clave en la respuesta, metadata del mensaje, etc.).
- `handlers/base-action.handler.ts`:
  ```typescript
  abstract class BaseActionHandler {
    abstract execute(context: ActionContext): Promise<ActionResult>;
  }
  ```
- `handlers/escalate-human.handler.ts` — Cambia conversation.status a WAITING_HUMAN, asigna agente, notifica.
- `handlers/create-ticket.handler.ts` — Placeholder para integración con CRM externo.
- `handlers/send-notification.handler.ts` — Envía notificación al tenant (email o webhook a su sistema).
- Cada acción se loguea en ActionLog.

**Criterio de éxito**: Un mensaje entrante de WhatsApp genera una respuesta de IA que se envía de vuelta al usuario por WhatsApp. Si la IA detecta que debe escalar, la conversación cambia a WAITING_HUMAN. Todo queda logueado.

**Archivos resultantes**:
```
src/modules/
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
└── queue/
    └── processors/
        └── outbound-message.processor.ts
```

---

### FASE 5 — Testing, seed data y hardening (estimado: 1-2 sesiones)

**Objetivo**: Tests, datos de prueba, manejo de errores robusto, logging.

**Tareas**:

**5.1 — Seed data**

Crear `api/prisma/seed.ts`:
- Crear un tenant de prueba con plan PRO.
- Crear un user OWNER para ese tenant.
- Crear un canal WhatsApp y uno de Instagram.
- Crear un AiContext con system prompt de prueba.
- Crear 2-3 contactos con conversaciones y mensajes de ejemplo.

**5.2 — Tests unitarios**

Tests prioritarios:
- `webhooks.service.spec.ts` — Testear flujo completo de webhook con mocks.
- `whatsapp.adapter.spec.ts` — Testear parseo de payloads reales de WhatsApp.
- `message-pipeline.service.spec.ts` — Testear cada step del pipeline.
- `ai-engine.service.spec.ts` — Testear construcción de contexto y fallback.
- `ai-memory.service.spec.ts` — Testear ventana de memoria y compresión.
- `crypto.util.spec.ts` — Testear encriptación/desencriptación de credenciales.

**5.3 — Tests e2e**

- Flujo completo: webhook entrante → procesamiento → respuesta IA → envío.
- Auth: registro, login, acceso con JWT, rechazo sin JWT.
- Multitenancy: verificar que un tenant no puede ver datos de otro.

**5.4 — Hardening**

- Rate limiting global con `@nestjs/throttler`.
- Helmet para headers de seguridad.
- CORS configurado por entorno.
- Validación de IPs de origen para webhooks (Meta publica sus rangos de IPs).
- Manejo de timeout en llamadas a IA (30s máximo, retorna fallback si excede).
- Graceful shutdown: cerrar conexiones de Prisma, Redis y BullMQ al recibir SIGTERM.
- Health checks detallados: `/health/db`, `/health/redis`, `/health/queues`.

**5.5 — Logging estructurado**

Crear `api/src/shared/logger/`:
- Logger service usando `nestjs-pino` o Winston.
- Logs en formato JSON para producción (facilita parseo en CloudWatch, Datadog, etc.).
- Incluir siempre: tenantId, conversationId, channelType, requestId.

**Criterio de éxito**: Tests pasan. Seed data funciona. El sistema no se cae ante payloads malformados, timeouts de IA, o errores de red.

---

## Variables de entorno requeridas

Definidas en `.env.example` en la raíz del monorepo. El script `scripts/setup.sh` genera los secretos automáticamente.

```env
# PostgreSQL
POSTGRES_USER=m2_user
POSTGRES_PASSWORD=generated-by-setup
POSTGRES_PORT=5433
N8N_DB=n8n_db
EVOLUTION_DB=evolution_db
API_DB=m2_api

# Database (connection string para Prisma)
DATABASE_URL=postgresql://m2_user:pass@postgres:5432/m2_api

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Auth
JWT_SECRET=your-secret-key
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Encryption (para credenciales de canales)
ENCRYPTION_KEY=32-byte-hex-key

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Storage (archivos de contexto)
STORAGE_TYPE=local  # o "s3"
STORAGE_LOCAL_PATH=./uploads
# S3_BUCKET=...
# S3_REGION=...
# S3_ACCESS_KEY=...
# S3_SECRET_KEY=...

# Meta (WhatsApp, Instagram, Messenger)
META_APP_SECRET=your-meta-app-secret
META_VERIFY_TOKEN=your-verify-token

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token

# App
PORT=3000
NODE_ENV=development

# n8n
N8N_PORT=5678

# Evolution API
EVOLUTION_PORT=8080
EVOLUTION_API_KEY=generated-by-setup
```

---

## Reglas para el agente de IA

1. **No modificar servicios existentes** del docker-compose (n8n, evolution) salvo para reemplazar credenciales hardcodeadas por variables de `.env`. Postgres y Redis se comparten con el servicio api.
2. **Respetar la estructura del monorepo**: Dockerfile en `docker/api/`, scripts en `scripts/`, documentación en `docs/`. El código NestJS vive exclusivamente en `api/`.
3. **Cada módulo es independiente**. Un módulo importa otros módulos, nunca servicios directamente de otro módulo.
4. **Todo query a BD debe filtrar por tenantId**. Sin excepción. Usar el guard de tenant para inyectarlo.
5. **Prisma es la única forma de acceder a la BD**. No raw queries salvo justificación explícita.
6. **Cada endpoint debe tener su DTO** con decoradores de class-validator.
7. **Swagger decorators** en cada controller y DTO (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
8. **No hardcodear** valores. Todo configurable via `.env` o BD.
9. **Respetar el schema de Prisma** proporcionado. No agregar ni quitar campos sin confirmación.
10. **Seguir la convención de NestJS**: un archivo por clase, nombre del archivo = nombre de la clase en kebab-case.
11. **Commits atómicos** por feature/módulo completado.