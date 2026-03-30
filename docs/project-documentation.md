# M2 Backend - Documentacion del Proyecto

## Tabla de Contenidos

1. [Vision General](#vision-general)
2. [Stack Tecnologico](#stack-tecnologico)
3. [Arquitectura](#arquitectura)
4. [Estructura del Repositorio](#estructura-del-repositorio)
5. [Infraestructura (Docker)](#infraestructura-docker)
6. [Base de Datos](#base-de-datos)
7. [Modulos del Backend](#modulos-del-backend)
8. [API Endpoints](#api-endpoints)
9. [Flujo de Mensajes](#flujo-de-mensajes)
10. [Motor de IA](#motor-de-ia)
11. [Seguridad](#seguridad)
12. [Variables de Entorno](#variables-de-entorno)
13. [Comandos de Desarrollo](#comandos-de-desarrollo)
14. [Testing](#testing)
15. [Despliegue](#despliegue)

---

## Vision General

**M2** es una plataforma centralizada de comunicaciones con IA que unifica chats de WhatsApp, Instagram, Messenger y Telegram en una sola interfaz. Cada mensaje entrante es procesado automaticamente por un asistente de IA configurable por tenant, con memoria conversacional y despacho automatico de respuestas.

### Capacidades principales

- **Multitenancy**: Cada organizacion (tenant) opera de forma aislada con sus propios usuarios, canales, contactos y configuracion de IA.
- **Recepcion omnicanal**: Webhooks unificados para WhatsApp, Instagram, Messenger y Telegram.
- **Pipeline asincrono**: Los mensajes entrantes se procesan via BullMQ (Redis) para no bloquear la respuesta al proveedor.
- **IA conversacional**: Integra OpenAI y Anthropic con memoria de conversacion y summarizacion automatica.
- **Despacho de respuestas**: Las respuestas de la IA se envian de vuelta al canal correspondiente automaticamente.
- **Auditoria**: Todas las acciones (envios, procesamiento IA, errores) quedan registradas en logs de acciones y webhooks.

---

## Stack Tecnologico

| Componente | Tecnologia | Version |
|---|---|---|
| Runtime | Node.js | 20+ |
| Framework | NestJS | 11.x |
| Lenguaje | TypeScript | 5.7+ |
| ORM | Prisma | 6.x |
| Base de datos | PostgreSQL | 16 |
| Cache / Colas | Redis + BullMQ | 6.2 / 5.x |
| Auth | JWT (access + refresh) | - |
| Documentacion API | Swagger (@nestjs/swagger) | 11.x |
| IA | OpenAI SDK + Anthropic SDK | - |
| Contenedores | Docker + Docker Compose | - |
| Automatizacion | n8n | latest |
| WhatsApp API | Evolution API | 2.3.1 |
| Testing | Jest + ts-jest | 30.x |

---

## Arquitectura

```
                         +------------------+
                         |   Clientes Web   |
                         |  (Frontend M2)   |
                         +--------+---------+
                                  |
                                  | REST API (JWT)
                                  v
+------------------+    +---------+---------+    +------------------+
|   Meta Platform  |--->|                   |--->|     Redis        |
|   (WA/IG/MSG)    |    |    NestJS API     |    |  (BullMQ Queue)  |
+------------------+    |    Puerto 3000    |    +--------+---------+
                        |                   |             |
+------------------+    |  - Auth           |    +--------v---------+
|    Telegram      |--->|  - Webhooks       |    | Message Pipeline |
|    Bot API       |    |  - CRUD           |    |  (Worker)        |
+------------------+    |  - AI Engine      |    |                  |
                        |  - Dispatcher     |    | 1. Contact Res.  |
                        +---------+---------+    | 2. Conv. Res.    |
                                  |              | 3. Msg Persist   |
                                  v              | 4. AI Process    |
                        +---------+---------+    | 5. Dispatch Resp |
                        |   PostgreSQL 16   |    +------------------+
                        |   (Prisma ORM)    |
                        +-------------------+
```

### Patron de diseno

- **Modular**: Cada dominio es un modulo NestJS independiente con su service, controller y DTOs.
- **Adapter Pattern**: Los canales (WhatsApp, Telegram, etc.) implementan una interfaz comun `IChannelAdapter` y se resuelven via factory.
- **Pipeline Pattern**: El procesamiento de mensajes se descompone en pasos atomicos (ContactResolver -> ConversationResolver -> MessagePersister -> AI -> Dispatch).
- **Multitenancy por filtro**: Todas las queries incluyen `tenantId` extraido del JWT del usuario autenticado.

---

## Estructura del Repositorio

```
m2-back/
|-- .env.example                     # Template de variables de entorno
|-- .env                             # Variables reales (git-ignored)
|-- docker-compose.yml               # Orquestacion de todos los servicios
|-- docker-compose.override.yml      # Overrides para desarrollo (hot-reload)
|-- CLAUDE.md                        # Instrucciones para agente de desarrollo
|
|-- docs/
|   |-- implementation-plan.md       # Plan de implementacion original
|   |-- fase-0-completada.md         # Reporte de FASE 0
|   |-- fases-pendientes.md          # Referencia de fases 1-5
|   +-- project-documentation.md     # Este documento
|
|-- docker/
|   |-- api/
|   |   +-- Dockerfile               # Multi-stage: base, dev, build, production
|   +-- postgres/
|       +-- init-db.sh               # Crea 3 databases: n8n_db, evolution_db, m2_api
|
|-- scripts/
|   |-- setup.sh                     # Setup inicial (.env, secretos)
|   |-- seed.sh                      # Ejecuta prisma db seed en container
|   +-- migrate.sh                   # Ejecuta prisma migrate en container
|
+-- api/                             # Backend NestJS
    |-- package.json
    |-- tsconfig.json
    |-- nest-cli.json
    |-- prisma/
    |   |-- schema.prisma            # 13 modelos de datos
    |   +-- seed.ts                  # Datos de prueba
    +-- src/
        |-- main.ts                  # Bootstrap con hardening
        |-- app.module.ts            # Root module (17 modulos)
        |
        |-- config/                  # Configuracion (env vars)
        |   |-- config.module.ts
        |   |-- database.config.ts
        |   +-- redis.config.ts
        |
        |-- prisma/                  # ORM global
        |   |-- prisma.module.ts
        |   +-- prisma.service.ts
        |
        |-- health/                  # Health check
        |   |-- health.module.ts
        |   +-- health.controller.ts
        |
        |-- common/                  # Codigo compartido
        |   |-- guards/              # ApiKeyGuard, TenantGuard, RolesGuard
        |   |-- decorators/          # @CurrentUser, @CurrentTenant, @Roles
        |   |-- interceptors/        # TransformInterceptor, LoggingInterceptor
        |   |-- filters/             # HttpExceptionFilter (global)
        |   |-- dto/                 # PaginationDto, ApiResponseDto
        |   +-- interfaces/          # IChannelAdapter, NormalizedMessage
        |
        |-- shared/
        |   +-- utils/               # crypto (AES-256-GCM), text-cleaner
        |
        |-- queue/
        |   |-- queue.module.ts      # BullMQ global config
        |   +-- processors/
        |       +-- message-inbound.processor.ts
        |
        +-- modules/
            |-- auth/                # JWT auth (register, login, refresh, me)
            |-- tenants/             # Tenant CRUD (solo propietario)
            |-- channels/            # Canales (CRUD, cifrado de credenciales)
            |-- contacts/            # Contactos (busqueda, filtros)
            |-- conversations/       # Conversaciones (estados, asignacion)
            |-- messages/            # Mensajes (lectura, filtros)
            |-- webhooks/            # Recepcion de webhooks + adapters
            |   +-- adapters/        # WhatsApp, Instagram, Messenger, Telegram
            |-- message-pipeline/    # Pipeline asincrono de procesamiento
            |   +-- steps/           # ContactResolver, ConversationResolver, MessagePersister
            |-- ai-context/          # Configuracion de IA por tenant
            |-- ai-memory/           # Memoria conversacional con summarizacion
            |-- ai-engine/           # Orquestador de IA
            |   +-- providers/       # OpenAI, Anthropic
            |-- response-dispatcher/ # Envio de respuestas
            |   +-- senders/         # WhatsApp, Telegram, Instagram, Messenger
            +-- actions/             # Log de acciones (auditoria)
```

---

## Infraestructura (Docker)

El proyecto orquesta 5 servicios via `docker-compose.yml`:

| Servicio | Imagen | Puerto | Funcion |
|---|---|---|---|
| **postgres** | `postgres:16` | 5433 | Base de datos principal (3 DBs) |
| **redis** | `redis:6.2-alpine` | 6379 | Cache, colas BullMQ, refresh tokens |
| **n8n** | `n8nio/n8n` | 5678 | Automatizacion de workflows |
| **evolution-api** | `evoapicloud/evolution-api:v2.3.1` | 8080 | API de WhatsApp |
| **api** | Build local (`docker/api/Dockerfile`) | 3000 | Backend NestJS |

### Dockerfile (Multi-stage)

```
base        -> npm ci (instala dependencias)
development -> Copia src, ejecuta start:dev (hot-reload)
build       -> prisma generate + npm run build
production  -> Imagen minima con dist/ compilado
```

### Health checks

- PostgreSQL: `pg_isready` cada 5s
- Redis: `redis-cli ping` cada 5s
- El servicio `api` depende de ambos con `condition: service_healthy`

### docker-compose.override.yml (desarrollo)

Monta `./api/src` y `./api/prisma` como volumenes para hot-reload automatico con `npm run start:dev`.

---

## Base de Datos

### Diagrama de Modelos (13 tablas)

```
Tenant (tenants)
  |-- 1:N --> User (users)
  |-- 1:N --> Channel (channels)
  |-- 1:N --> Contact (contacts)
  |-- 1:N --> Conversation (conversations)
  |-- 1:N --> AiContext (ai_contexts)
  +-- 1:N --> ContextFile (context_files)

Conversation (conversations)
  |-- N:1 --> Channel
  |-- N:1 --> Contact
  |-- N:1 --> User (assigned agent)
  |-- 1:N --> Message (messages)
  +-- 1:N --> AiMemoryEntry (ai_memory_entries)

ActionLog (action_logs)         -- Auditoria de acciones
WebhookLog (webhook_logs)       -- Registro de webhooks entrantes
```

### Modelos principales

| Modelo | Tabla | Descripcion |
|---|---|---|
| **Tenant** | `tenants` | Organizacion. Plan: FREE/STARTER/PRO/ENTERPRISE |
| **User** | `users` | Miembro del equipo. Rol: OWNER/ADMIN/AGENT |
| **Channel** | `channels` | Canal integrado. Tipo: WHATSAPP/INSTAGRAM/MESSENGER/TELEGRAM/WEBCHAT |
| **Contact** | `contacts` | Cliente final identificado por externalId + channelType |
| **Conversation** | `conversations` | Hilo de chat. Estado: ACTIVE/WAITING_HUMAN/CLOSED/ARCHIVED |
| **Message** | `messages` | Mensaje individual. Direccion: INBOUND/OUTBOUND. 9 tipos de contenido |
| **AiContext** | `ai_contexts` | Configuracion de IA (prompt, modelo, proveedor, ventana de memoria) |
| **ContextFile** | `context_files` | Archivos de conocimiento para la IA |
| **AiMemoryEntry** | `ai_memory_entries` | Memoria conversacional (USER/ASSISTANT/SYSTEM/SUMMARY) |
| **ActionLog** | `action_logs` | Registro de acciones con estado PENDING/SUCCESS/FAILED |
| **WebhookLog** | `webhook_logs` | Log de webhooks crudos para debugging |

### Indices clave

- `conversations`: status, channelId, contactId, lastMessageAt
- `messages`: conversationId+createdAt, channelId+direction, externalId
- `contacts`: tenantId+phone, tenantId+email
- `ai_memory_entries`: conversationId+isActive+createdAt

---

## Modulos del Backend

### Modulos de Infraestructura

| Modulo | Global | Descripcion |
|---|---|---|
| `AppConfigModule` | Si | Carga variables de entorno via `@nestjs/config` |
| `PrismaModule` | Si | Inyecta `PrismaService` (extends PrismaClient) |
| `QueueModule` | Si | Configura BullMQ con conexion a Redis |
| `HealthModule` | No | Endpoint `GET /health` |

### Modulos de Dominio

| Modulo | Endpoints | Auth | Descripcion |
|---|---|---|---|
| `AuthModule` | 4 | Parcial | Register, login, refresh (publicos) + me (protegido) |
| `TenantsModule` | 2 | JWT | Ver/editar tenant propio (OWNER para edicion) |
| `ChannelsModule` | 5 | JWT | CRUD de canales con cifrado AES-256-GCM de credenciales |
| `ContactsModule` | 4 | JWT | Busqueda con filtros, tags, metadata |
| `ConversationsModule` | 4 | JWT | Filtros por estado/canal/agente, cierre de conversaciones |
| `MessagesModule` | 2 | JWT | Lectura de mensajes con filtros de fecha y tipo |
| `AiContextModule` | 5 | JWT | CRUD de configuracion de IA por tenant |
| `ActionsModule` | 2 | JWT | Consulta de logs de acciones |
| `WebhooksModule` | 2 | No | Recepcion publica de webhooks (validacion por firma) |

### Modulos de Procesamiento (sin endpoints)

| Modulo | Descripcion |
|---|---|
| `MessagePipelineModule` | Processor BullMQ que orquesta el pipeline completo |
| `AiMemoryModule` | Gestion de memoria conversacional con summarizacion |
| `AiEngineModule` | Orquestador que conecta contexto + memoria + proveedores |
| `ResponseDispatcherModule` | Envio de respuestas al canal correspondiente |

---

## API Endpoints

Todos los endpoints (excepto health y webhooks) tienen el prefijo `/api`.

### Autenticacion

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Crea tenant + usuario propietario |
| `POST` | `/api/auth/login` | No | Devuelve accessToken + refreshToken |
| `POST` | `/api/auth/refresh` | No | Renueva tokens con refreshToken |
| `GET` | `/api/auth/me` | JWT | Perfil del usuario autenticado |

### Tenants

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/tenants/me` | JWT | Info del tenant actual |
| `PATCH` | `/api/tenants/me` | JWT (OWNER) | Actualizar nombre/settings |

### Canales

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/channels` | JWT | Crear canal |
| `GET` | `/api/channels` | JWT | Listar canales (paginado) |
| `GET` | `/api/channels/:id` | JWT | Detalle de canal (con credenciales descifradas) |
| `PATCH` | `/api/channels/:id` | JWT | Actualizar canal |
| `DELETE` | `/api/channels/:id` | JWT | Desactivar canal (soft-delete) |

### Contactos

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/contacts` | JWT | Listar con busqueda y filtro por channelType |
| `GET` | `/api/contacts/:id` | JWT | Detalle con conteo de conversaciones |
| `PATCH` | `/api/contacts/:id` | JWT | Actualizar datos del contacto |
| `DELETE` | `/api/contacts/:id` | JWT | Eliminar contacto |

### Conversaciones

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/conversations` | JWT | Listar con filtros (status, canal, agente) |
| `GET` | `/api/conversations/:id` | JWT | Detalle con ultimos 20 mensajes |
| `PATCH` | `/api/conversations/:id` | JWT | Cambiar estado/agente/aiEnabled |
| `POST` | `/api/conversations/:id/close` | JWT | Cerrar conversacion |

### Mensajes

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/messages?conversationId=...` | JWT | Listar mensajes de una conversacion |
| `GET` | `/api/messages/:id` | JWT | Detalle de mensaje |

### Contextos de IA

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/ai-contexts` | JWT | Crear configuracion de IA |
| `GET` | `/api/ai-contexts` | JWT | Listar contextos |
| `GET` | `/api/ai-contexts/:id` | JWT | Detalle con archivos |
| `PATCH` | `/api/ai-contexts/:id` | JWT | Actualizar configuracion |
| `DELETE` | `/api/ai-contexts/:id` | JWT | Desactivar contexto |

### Acciones

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/actions` | JWT | Listar acciones (paginado, filtros) |
| `GET` | `/api/actions/conversation/:id` | JWT | Acciones de una conversacion |

### Webhooks (sin prefijo /api)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/webhooks/:channelType/:channelId` | Firma | Verificacion de webhook (Meta challenge) |
| `POST` | `/webhooks/:channelType/:channelId` | Firma | Recepcion de mensaje entrante |

### Health (sin prefijo /api)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/health` | No | `{ status: 'ok', timestamp: '...' }` |

### Swagger

Disponible en `http://localhost:3000/api/docs` cuando `SWAGGER_ENABLED=true`.

---

## Flujo de Mensajes

### Mensaje entrante (Inbound)

```
1. Proveedor (WhatsApp/Telegram/etc) envia POST a /webhooks/:type/:channelId
                                |
2. WebhooksController recibe el request
   - Busca el canal en BD
   - Registra WebhookLog
   - Valida firma HMAC (Meta) o secret token (Telegram)
   - Normaliza el payload via Adapter (WhatsApp/Instagram/Messenger/Telegram)
   - Encola en BullMQ queue "message-inbound"
   - Retorna 200 inmediatamente
                                |
3. MessageInboundProcessor (Worker BullMQ) procesa la cola:
   a) ContactResolver: Upsert contacto por (tenantId, externalId, channelType)
   b) ConversationResolver: Busca conversacion activa o crea una nueva
   c) MessagePersister: Crea registro Message con contenido sanitizado
   d) Si conversation.aiEnabled == true:
      - AiEngineService.processMessage()
        i.   Busca contexto IA activo del tenant
        ii.  Agrega mensaje del usuario a la memoria
        iii. Construye array de mensajes (system + memoria + nuevo mensaje)
        iv.  Llama al proveedor (OpenAI o Anthropic)
        v.   Almacena respuesta en memoria
        vi.  Trigger summarizacion si la ventana esta llena
      - ResponseDispatcherService.dispatch()
        i.   Busca conversacion con canal y contacto
        ii.  Descifra credenciales del canal
        iii. Selecciona sender via factory
        iv.  Envia mensaje al proveedor externo
        v.   Crea registro Message OUTBOUND
   e) Registra ActionLog de todo el proceso
```

### Adaptadores de canal

Cada canal implementa `IChannelAdapter`:

| Canal | Validacion | Formato entrada | Verificacion |
|---|---|---|---|
| **WhatsApp** | HMAC-SHA256 (x-hub-signature-256) | `entry[].changes[].value.messages[]` | Meta challenge (hub.mode=subscribe) |
| **Instagram** | HMAC-SHA256 (x-hub-signature-256) | `entry[].messaging[]` | Meta challenge |
| **Messenger** | HMAC-SHA256 (x-hub-signature-256) | `entry[].messaging[]` | Meta challenge |
| **Telegram** | Secret token header directo | `message` object | No requiere |

---

## Motor de IA

### Arquitectura

```
AiEngineService (orquestador)
  |-- AiContextService    -> Obtiene configuracion (prompt, modelo, proveedor)
  |-- AiMemoryService     -> Gestiona memoria conversacional
  |-- OpenAiProvider      -> Llama a OpenAI API
  +-- AnthropicProvider   -> Llama a Anthropic API
```

### Configuracion por tenant (AiContext)

| Campo | Descripcion | Default |
|---|---|---|
| `systemPrompt` | Instrucciones base del asistente | (requerido) |
| `personality` | Descripcion de personalidad | null |
| `language` | Idioma de respuesta | `es` |
| `provider` | OPENAI / ANTHROPIC / CUSTOM | OPENAI |
| `model` | ID del modelo | `gpt-4o-mini` |
| `maxTokens` | Tokens maximos de respuesta | 1000 |
| `memoryWindowSize` | Entradas de memoria a mantener | 20 |
| `fallbackMessage` | Mensaje cuando la IA falla | null |

### Memoria conversacional

- Cada mensaje del usuario y de la IA se almacena como `AiMemoryEntry`.
- Cuando las entradas activas superan `windowSize * 1.5`, se ejecuta summarizacion automatica:
  1. Las entradas mas antiguas (fuera de la ventana) se condensan en una entrada SUMMARY.
  2. Las entradas originales se marcan como `isActive=false`.
- Esto mantiene el contexto relevante sin exceder limites de tokens.

---

## Seguridad

### Autenticacion

- **Access Token**: JWT firmado con `JWT_SECRET`, expira en 15 minutos (configurable).
- **Refresh Token**: JWT firmado con `JWT_REFRESH_SECRET`, almacenado en Redis con TTL de 7 dias.
- Al hacer refresh, el token anterior se invalida (rotacion de tokens).

### Cifrado

- Las credenciales de canales (API keys, tokens) se cifran con **AES-256-GCM** usando `ENCRYPTION_KEY`.
- IV aleatorio por cada operacion de cifrado.
- Formato almacenado: `iv:authTag:ciphertext`.

### Hardening HTTP

| Medida | Implementacion |
|---|---|
| Headers de seguridad | `helmet()` middleware |
| CORS | Configurable via `CORS_ORIGIN` |
| Rate limiting | 100 requests/minuto por IP (ThrottlerModule) |
| Validacion de input | `ValidationPipe` global (whitelist, forbidNonWhitelisted) |
| Sanitizacion | Contenido de mensajes pasa por `sanitizeContent()` (strip HTML, normalize unicode) |
| Raw body | Habilitado para validacion de firmas HMAC en webhooks |

### Validacion de webhooks

- **Meta (WhatsApp/Instagram/Messenger)**: HMAC-SHA256 del body con `META_APP_SECRET`.
- **Telegram**: Comparacion directa del header `x-telegram-bot-api-secret-token`.
- Los webhooks invalidos se rechazan con 401 y se registran en `WebhookLog`.

---

## Variables de Entorno

### Requeridas

| Variable | Descripcion | Ejemplo |
|---|---|---|
| `POSTGRES_USER` | Usuario PostgreSQL | `m2_user` |
| `POSTGRES_PASSWORD` | Password PostgreSQL | (generar) |
| `JWT_SECRET` | Secreto para access tokens | (generar, min 32 chars) |
| `JWT_REFRESH_SECRET` | Secreto para refresh tokens | (generar, min 32 chars) |
| `ENCRYPTION_KEY` | Clave AES-256 en hex (32 bytes = 64 chars hex) | (generar) |

### Opcionales

| Variable | Default | Descripcion |
|---|---|---|
| `API_PORT` | `3000` | Puerto del backend |
| `NODE_ENV` | `development` | Entorno |
| `CORS_ORIGIN` | `*` | Origenes CORS permitidos |
| `SWAGGER_ENABLED` | `true` | Habilitar Swagger UI |
| `JWT_EXPIRATION` | `15m` | TTL del access token |
| `JWT_REFRESH_EXPIRATION` | `7d` | TTL del refresh token |
| `REDIS_HOST` | `redis` | Host de Redis |
| `REDIS_PORT` | `6379` | Puerto de Redis |
| `OPENAI_API_KEY` | - | API key de OpenAI |
| `ANTHROPIC_API_KEY` | - | API key de Anthropic |
| `META_APP_SECRET` | - | App Secret de Meta (para webhooks WA/IG/MSG) |
| `META_VERIFY_TOKEN` | - | Token de verificacion de Meta |
| `TELEGRAM_BOT_TOKEN` | - | Token del bot de Telegram |
| `STORAGE_TYPE` | `local` | Tipo de storage (`local` o `s3`) |
| `STORAGE_LOCAL_PATH` | `./uploads` | Ruta de uploads locales |

---

## Comandos de Desarrollo

### Setup inicial

```bash
# 1. Copiar variables de entorno
cp .env.example .env
# Editar .env con valores reales (generar secrets)

# 2. Levantar infraestructura
docker compose up -d postgres redis

# 3. Instalar dependencias
cd api && npm install

# 4. Generar Prisma Client
npx prisma generate

# 5. Ejecutar migraciones
npx prisma migrate dev

# 6. Seed de datos de prueba
npx prisma db seed

# 7. Arrancar en modo desarrollo
npm run start:dev
```

### Con Docker (todo-en-uno)

```bash
# Levantar todos los servicios
docker compose up -d

# Ver logs del API
docker compose logs -f api

# Ejecutar migraciones dentro del container
docker compose exec api npx prisma migrate dev

# Ejecutar seed
docker compose exec api npx prisma db seed
```

### Scripts npm

| Comando | Descripcion |
|---|---|
| `npm run start:dev` | Desarrollo con hot-reload |
| `npm run start:debug` | Desarrollo con debugger |
| `npm run build` | Compilar TypeScript |
| `npm run start:prod` | Ejecutar build compilado |
| `npm test` | Ejecutar tests unitarios |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:cov` | Tests con cobertura |
| `npm run test:e2e` | Tests end-to-end |
| `npm run lint` | Lint + autofix |
| `npm run format` | Formatear con Prettier |

---

## Testing

### Configuracion

- **Framework**: Jest 30 con ts-jest
- **Module mapper**: Resuelve imports `.js` a `.ts` automaticamente
- **Cobertura**: Todos los archivos `.ts` en `src/`

### Test suites (33 tests)

| Suite | Archivo | Tests | Cobertura |
|---|---|---|---|
| AuthService | `auth/auth.service.spec.ts` | 7 | Register, login, refresh, profile |
| AiEngineService | `ai-engine/ai-engine.service.spec.ts` | 6 | Providers, fallback, memoria |
| WhatsAppAdapter | `webhooks/adapters/whatsapp.adapter.spec.ts` | 6 | Firma, verificacion, normalizacion |
| Crypto Utils | `shared/utils/crypto.util.spec.ts` | 4 | Encrypt/decrypt roundtrip, tampering |
| Text Cleaner | `shared/utils/text-cleaner.util.spec.ts` | 6 | Strip HTML, sanitize, normalize |
| ContactResolver | `message-pipeline/steps/contact-resolver.spec.ts` | 3 | Upsert, scoping por tenant |

### Ejecutar tests

```bash
# Todos los tests
npm test

# Con cobertura
npm run test:cov

# Un archivo especifico
npx jest --testPathPattern=auth.service

# En modo watch
npm run test:watch
```

### Seed de datos de prueba

El seed (`prisma/seed.ts`) crea:

| Entidad | Datos |
|---|---|
| Tenant | "Demo Company" (slug: `demo-company`, plan: PRO) |
| Admin | `admin@demo.com` / `Admin123!` (rol: OWNER) |
| Agent | `agent@demo.com` / `Agent123!` (rol: AGENT) |
| Canal | WhatsApp "WhatsApp Principal" (credenciales demo) |
| AI Context | "Asistente Principal" (OpenAI, gpt-4o-mini, espanol) |
| Contactos | Juan Perez, Maria Garcia (WhatsApp) |

---

## Despliegue

### Produccion con Docker

```bash
# Build de imagen de produccion
docker compose -f docker-compose.yml build api

# O build manual
cd api
docker build -f ../docker/api/Dockerfile --target production -t m2-api:latest .
```

La imagen de produccion:
- Usa Node 20 Alpine (imagen minima)
- Solo incluye `dist/`, `node_modules/` (sin devDependencies), y Prisma Client
- Ejecuta `node dist/main.js`
- Expone puerto 3000

### Variables criticas para produccion

```bash
NODE_ENV=production
SWAGGER_ENABLED=false
CORS_ORIGIN=https://tu-dominio.com
JWT_SECRET=<secreto-fuerte-generado>
JWT_REFRESH_SECRET=<otro-secreto-fuerte>
ENCRYPTION_KEY=<64-caracteres-hex>
```

### Checklist pre-produccion

- [ ] Generar todos los secrets con `openssl rand -hex 32`
- [ ] Configurar `CORS_ORIGIN` con el dominio real
- [ ] Deshabilitar Swagger (`SWAGGER_ENABLED=false`)
- [ ] Configurar API keys reales de OpenAI/Anthropic
- [ ] Configurar Meta App Secret y Verify Token
- [ ] Ejecutar `npx prisma migrate deploy`
- [ ] Verificar health check en `/health`
- [ ] Configurar reverse proxy (nginx) con HTTPS
- [ ] Configurar backups de PostgreSQL
