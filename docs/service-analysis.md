# M2 Backend - Analisis Detallado del Servicio

> Documento orientado a un desarrollador que necesita entender que es este servicio,
> como funciona internamente, y que hace cada pieza del codigo.

---

## Que es M2?

M2 es el **backend de una plataforma SaaS omnicanal de comunicaciones con IA**. En terminos simples: es un servicio que permite a empresas recibir mensajes de sus clientes desde WhatsApp, Telegram, Instagram y Messenger, procesarlos automaticamente con inteligencia artificial, y enviar respuestas de vuelta al mismo canal. Todo esto con soporte multi-tenant (multiples empresas en la misma instancia).

Piensa en M2 como un **hub centralizado de mensajeria**:

```
[Cliente en WhatsApp] --\
[Cliente en Telegram] ---+--> [M2 Backend] ---> [IA genera respuesta] ---> [Respuesta al canal original]
[Cliente en Instagram] --/
```

---

## Stack en una oracion

**NestJS + TypeScript + PostgreSQL + Prisma + Redis/BullMQ + OpenAI/Anthropic**, dockerizado con Compose.

---

## Anatomia del Proyecto

El repositorio tiene esta estructura de alto nivel:

```
m2-back/
├── api/                  # <-- El backend NestJS (aqui vive el codigo)
├── docker/               # Dockerfiles e init scripts
├── docs/                 # Documentacion
├── scripts/              # Scripts de setup/seed/migrate
├── docker-compose.yml    # Orquestacion de servicios
└── CLAUDE.md             # Instrucciones para el agente de desarrollo IA
```

Todo el codigo fuente relevante esta dentro de `api/src/`.

---

## Los 5 Servicios de Infraestructura (Docker)

| Servicio | Para que sirve | Puerto |
|---|---|---|
| **PostgreSQL 16** | Base de datos principal | 5433 |
| **Redis** | Colas de mensajes (BullMQ) + cache de tokens JWT refresh | 6379 |
| **n8n** | Motor de automatizacion (workflows externos) | 5678 |
| **Evolution API** | Conector alternativo para WhatsApp | 8080 |
| **api (NestJS)** | El backend propiamente dicho | 3000 |

---

## Mapa de Archivos: Que Hace Cada Cosa

### Punto de Entrada

| Archivo | Que hace |
|---|---|
| `api/src/main.ts` | Arranca la aplicacion NestJS. Configura Helmet (headers de seguridad), CORS, ValidationPipe global, raw body parsing (necesario para validar firmas HMAC de webhooks), Swagger, y el puerto. |
| `api/src/app.module.ts` | Modulo raiz. Importa los 17 modulos del sistema. Es el "mapa" de todo lo que existe en la aplicacion. |

### Configuracion (`api/src/config/`)

| Archivo | Que hace |
|---|---|
| `config.module.ts` | Modulo global que carga variables de entorno via `@nestjs/config`. |
| `database.config.ts` | Expone la configuracion de conexion a PostgreSQL (lee `DATABASE_URL`). |
| `redis.config.ts` | Expone host/port de Redis para BullMQ y cache. |

### Base de Datos (`api/src/prisma/` + `api/prisma/`)

| Archivo | Que hace |
|---|---|
| `prisma/schema.prisma` | Define los 13 modelos de datos (Tenant, User, Channel, Contact, Conversation, Message, AiContext, ContextFile, AiMemoryEntry, ActionLog, WebhookLog, etc.) con sus relaciones, indices y enums. **Es el archivo mas importante para entender la estructura de datos.** |
| `prisma/seed.ts` | Script que puebla la BD con datos de prueba: un tenant "Demo Company", un admin, un agente, un canal WhatsApp, un contexto IA, y dos contactos de ejemplo. |
| `src/prisma/prisma.service.ts` | Servicio global que extiende `PrismaClient`. Es la unica puerta de acceso a la BD en toda la app. |
| `src/prisma/prisma.module.ts` | Modulo global que exporta `PrismaService` para que cualquier modulo lo inyecte. |

### Codigo Compartido (`api/src/common/`)

#### Guards (Proteccion de rutas)

| Archivo | Que hace |
|---|---|
| `guards/jwt-auth.guard.ts` | Valida que el request tenga un Bearer token JWT valido. Si no, retorna 401. |
| `guards/tenant.guard.ts` | Extrae el `tenantId` del JWT y lo adjunta al request. Garantiza aislamiento multi-tenant. |
| `guards/roles.guard.ts` | Verifica que el usuario tenga el rol requerido (OWNER, ADMIN, AGENT). Se usa con el decorador `@Roles()`. |
| `guards/api-key.guard.ts` | Guard para autenticacion por API key (preparado pero no activamente usado en endpoints). |

#### Decoradores

| Archivo | Que hace |
|---|---|
| `decorators/current-user.decorator.ts` | `@CurrentUser()` - Extrae el usuario autenticado del request. Evita hacer `req.user` manualmente. |
| `decorators/current-tenant.decorator.ts` | `@CurrentTenant()` - Extrae el tenantId del request. |
| `decorators/roles.decorator.ts` | `@Roles('OWNER', 'ADMIN')` - Marca que roles pueden acceder a una ruta. |

#### Interceptores

| Archivo | Que hace |
|---|---|
| `interceptors/transform.interceptor.ts` | Envuelve todas las respuestas en un formato estandar: `{ success: true, data: ..., timestamp: ... }`. |
| `interceptors/logging.interceptor.ts` | Loguea el metodo HTTP, URL, y tiempo de ejecucion de cada request. |

#### Filtros

| Archivo | Que hace |
|---|---|
| `filters/http-exception.filter.ts` | Captura excepciones no manejadas y las convierte en respuestas JSON consistentes con `{ success: false, error: ..., statusCode: ... }`. |

#### DTOs e Interfaces

| Archivo | Que hace |
|---|---|
| `dto/pagination.dto.ts` | DTO reutilizable con `page` y `limit` para endpoints paginados. |
| `dto/api-response.dto.ts` | Tipo generico para la respuesta estandar de la API. |
| `interfaces/channel-adapter.interface.ts` | Define el contrato `IChannelAdapter` que todos los adaptadores de canal deben cumplir. |
| `interfaces/normalized-message.interface.ts` | Define `NormalizedMessage`, la estructura comun a la que se normalizan los mensajes de cualquier plataforma. |

### Utilidades (`api/src/shared/utils/`)

| Archivo | Que hace |
|---|---|
| `crypto.util.ts` | Funciones `encrypt()` y `decrypt()` usando AES-256-GCM. Se usa para cifrar/descifrar las credenciales de canales (API keys, tokens de Meta/Telegram). Cada cifrado genera un IV aleatorio. Formato almacenado: `iv:authTag:ciphertext`. |
| `text-cleaner.util.ts` | Funcion `sanitizeContent()` que limpia el texto de mensajes: strip HTML, normaliza unicode, recorta longitud. Protege contra XSS almacenado. |

### Cola de Procesamiento (`api/src/queue/`)

| Archivo | Que hace |
|---|---|
| `queue.module.ts` | Modulo global que configura BullMQ con la conexion a Redis. Registra la cola `message-inbound`. |
| `processors/message-inbound.processor.ts` | **Worker critico**: procesa cada mensaje entrante de la cola. Ejecuta el pipeline completo: resolver contacto → resolver conversacion → persistir mensaje → procesar con IA → despachar respuesta. Si falla, BullMQ reintenta 3 veces con backoff exponencial. |

---

## Modulos de Dominio (`api/src/modules/`)

### auth/ — Autenticacion y Registro

| Archivo | Que hace |
|---|---|
| `auth.controller.ts` | 4 endpoints: `POST /register`, `POST /login`, `POST /refresh`, `GET /me`. Los tres primeros son publicos; `/me` requiere JWT. |
| `auth.service.ts` | Logica de negocio: hasheo de passwords con bcrypt, generacion de JWT (access + refresh), validacion de credenciales, rotacion de refresh tokens en Redis. |
| `auth.module.ts` | Configura JwtModule y PassportModule. Registra la estrategia JWT. |
| `strategies/jwt.strategy.ts` | Estrategia Passport que extrae y valida el payload del JWT (userId, tenantId, role, email). |
| `dto/register.dto.ts` | Validacion de registro: email, password, nombre, nombre del tenant. |
| `dto/login.dto.ts` | Validacion de login: email + password. |

**Flujo de auth**: Register crea un Tenant + User (OWNER) en una transaccion. Login valida credenciales y retorna access token (15min) + refresh token (7d, guardado en Redis). Refresh rota el token anterior.

### tenants/ — Gestion de Tenant

| Archivo | Que hace |
|---|---|
| `tenants.controller.ts` | 2 endpoints: `GET /tenants/me` (ver info), `PATCH /tenants/me` (editar, solo OWNER). |
| `tenants.service.ts` | Lee y actualiza el tenant del usuario autenticado. |

### channels/ — Canales de Comunicacion

| Archivo | Que hace |
|---|---|
| `channels.controller.ts` | CRUD completo: crear, listar, ver detalle, actualizar, desactivar (soft-delete). |
| `channels.service.ts` | Al crear/actualizar un canal, **cifra las credenciales** (API keys, tokens) con AES-256-GCM antes de guardarlas en BD. Al leer, las descifra. |
| `dto/create-channel.dto.ts` | Validacion: nombre, tipo (WHATSAPP/INSTAGRAM/etc), credenciales como JSON, webhook secret opcional. |

### contacts/ — Contactos (Clientes Finales)

| Archivo | Que hace |
|---|---|
| `contacts.controller.ts` | CRUD con busqueda por nombre/telefono/email y filtro por `channelType`. |
| `contacts.service.ts` | Queries con paginacion. Los contactos se crean automaticamente cuando llega un mensaje de un remitente nuevo. |

### conversations/ — Conversaciones

| Archivo | Que hace |
|---|---|
| `conversations.controller.ts` | Listar con filtros (status, canal, agente asignado), ver detalle (incluye los ultimos 20 mensajes), actualizar (cambiar estado/agente/IA habilitada), cerrar. |
| `conversations.service.ts` | Logica de estados: ACTIVE → WAITING_HUMAN → CLOSED → ARCHIVED. Una conversacion con `aiEnabled=true` sera procesada por la IA automaticamente. |

### messages/ — Mensajes

| Archivo | Que hace |
|---|---|
| `messages.controller.ts` | Solo lectura: listar mensajes de una conversacion (paginado), ver detalle de un mensaje. |
| `messages.service.ts` | Queries con filtros de fecha y tipo de contenido. Los mensajes nunca se crean via API REST — solo llegan via webhooks o como respuesta de IA. |

### webhooks/ — Recepcion de Mensajes Externos

Este es el **punto de entrada de todos los mensajes externos**. Es donde WhatsApp, Telegram, etc. envian los mensajes de los clientes.

| Archivo | Que hace |
|---|---|
| `webhooks.controller.ts` | 2 endpoints publicos (sin JWT): `GET` para verificacion de webhook (Meta challenge), `POST` para recibir mensajes. Busca el canal en BD, valida la firma, normaliza el mensaje via adapter, y lo encola en BullMQ. |
| `webhooks.service.ts` | Orquesta: buscar canal, registrar WebhookLog, validar firma, obtener el adapter correcto, normalizar, encolar. |
| `webhooks.module.ts` | Importa todos los adapters y el QueueModule. |

#### Adapters (Normalizadores por plataforma)

Cada plataforma envia webhooks en un formato diferente. Los adapters normalizan todo a `NormalizedMessage`:

| Archivo | Plataforma | Como valida | Donde esta el mensaje en el payload |
|---|---|---|---|
| `adapters/whatsapp.adapter.ts` | WhatsApp Cloud API | HMAC-SHA256 con Meta App Secret | `entry[0].changes[0].value.messages[0]` |
| `adapters/telegram.adapter.ts` | Telegram Bot API | Header `x-telegram-bot-api-secret-token` | `message` (raiz del body) |
| `adapters/instagram.adapter.ts` | Instagram Messaging | HMAC-SHA256 con Meta App Secret | `entry[0].messaging[0]` |
| `adapters/messenger.adapter.ts` | Facebook Messenger | HMAC-SHA256 con Meta App Secret | `entry[0].messaging[0]` |

Todos producen un `NormalizedMessage` con: `externalId`, `senderId`, `senderName`, `content`, `contentType`, `mediaUrl`, `timestamp`, `rawPayload`.

### message-pipeline/ — Pipeline de Procesamiento

Este modulo contiene los **pasos atomicos** que se ejecutan para cada mensaje entrante (dentro del worker BullMQ):

| Archivo | Paso | Que hace |
|---|---|---|
| `steps/contact-resolver.ts` | 1ro | Busca si ya existe un contacto con ese `externalId + channelType + tenantId`. Si no existe, lo crea. Si existe, actualiza `lastContactAt` y datos como nombre/telefono si vienen en el mensaje. |
| `steps/conversation-resolver.ts` | 2do | Busca una conversacion ACTIVE entre ese contacto y ese canal. Si no existe, crea una nueva con `aiEnabled=true` por defecto. |
| `steps/message-persister.ts` | 3ro | Crea el registro `Message` en la BD con el contenido sanitizado, tipo, direccion INBOUND, y el `rawPayload` original para debugging. |

Despues de estos 3 pasos, si `conversation.aiEnabled === true`, se ejecuta el motor de IA y el despacho de respuesta.

### ai-context/ — Configuracion de IA

| Archivo | Que hace |
|---|---|
| `ai-context.controller.ts` | CRUD completo: crear, listar, ver (con archivos de conocimiento), actualizar, desactivar. |
| `ai-context.service.ts` | Gestiona la configuracion del asistente IA por tenant: system prompt, personalidad, idioma, proveedor (OpenAI/Anthropic), modelo, max tokens, tamano de ventana de memoria. |

### ai-memory/ — Memoria Conversacional

| Archivo | Que hace |
|---|---|
| `ai-memory.service.ts` | Gestiona el historial de la conversacion para la IA. Cada mensaje (del usuario y de la IA) se almacena como una `AiMemoryEntry` con rol (USER/ASSISTANT/SYSTEM/SUMMARY). Cuando el numero de entradas activas supera `windowSize * 1.5`, ejecuta **summarizacion automatica**: condensa las entradas mas antiguas en un resumen y las marca como inactivas. Esto evita que el contexto crezca sin limite. |

### ai-engine/ — Motor de IA

El **cerebro** del sistema. Orquesta la generacion de respuestas automaticas.

| Archivo | Que hace |
|---|---|
| `ai-engine.service.ts` | Orquestador principal. Cuando llega un mensaje: (1) obtiene el AiContext activo del tenant, (2) agrega el mensaje del usuario a la memoria, (3) construye el array de mensajes con system prompt + historial, (4) llama al proveedor de IA, (5) guarda la respuesta en memoria, (6) retorna el texto de respuesta. Si algo falla, retorna el `fallbackMessage` configurado. |
| `providers/openai.provider.ts` | Llama a la API de OpenAI (`/chat/completions`). Construye el array de messages con roles `system`, `user`, `assistant`. |
| `providers/anthropic.provider.ts` | Llama a la API de Anthropic (`/messages`). Separa el system prompt del resto de mensajes (Anthropic lo requiere asi). |

### response-dispatcher/ — Envio de Respuestas

| Archivo | Que hace |
|---|---|
| `response-dispatcher.service.ts` | Recibe la respuesta de la IA y la envia al canal correcto. (1) Busca la conversacion con canal y contacto, (2) descifra las credenciales del canal, (3) usa `SenderFactory` para obtener el sender adecuado, (4) envia el mensaje, (5) crea un registro `Message` OUTBOUND en BD, (6) registra un `ActionLog`. |
| `sender.factory.ts` | Factory que retorna el sender correcto segun el tipo de canal (WhatsApp, Telegram, Instagram, Messenger). |

#### Senders (Envio por plataforma)

| Archivo | Plataforma | Endpoint de envio |
|---|---|---|
| `senders/whatsapp.sender.ts` | WhatsApp | `graph.facebook.com/v18.0/{phoneNumberId}/messages` |
| `senders/telegram.sender.ts` | Telegram | `api.telegram.org/bot{token}/sendMessage` |
| `senders/instagram.sender.ts` | Instagram | `graph.facebook.com/v18.0/me/messages` |
| `senders/messenger.sender.ts` | Messenger | `graph.facebook.com/v18.0/me/messages` |

### actions/ — Auditoria

| Archivo | Que hace |
|---|---|
| `actions.controller.ts` | 2 endpoints: listar acciones (paginado con filtros), listar acciones de una conversacion especifica. |
| `actions.service.ts` | Lee logs de acciones. Cada accion registra: tipo, payload, resultado, estado (PENDING/SUCCESS/FAILED), y referencia a la conversacion si aplica. Las acciones se **crean** desde otros modulos (pipeline, dispatcher) no desde este servicio. |

---

## El Flujo Completo: De Mensaje Entrante a Respuesta

Este es el viaje completo de un mensaje:

```
1. Un cliente envia "Hola" por WhatsApp
        |
2. Meta envia un POST a /webhooks/whatsapp/{channelId}
        |
3. WebhooksController:
   - Busca el canal en BD
   - Valida firma HMAC-SHA256
   - WhatsAppAdapter normaliza el payload a NormalizedMessage
   - Encola en BullMQ (cola "message-inbound")
   - Retorna 200 inmediatamente a Meta
        |
4. MessageInboundProcessor (worker asincrono):
   a) ContactResolver: Upsert del contacto
   b) ConversationResolver: Busca/crea conversacion activa
   c) MessagePersister: Guarda el mensaje INBOUND en BD
        |
5. Si conversation.aiEnabled == true:
   d) AiEngineService.processMessage():
      - Busca el AiContext del tenant (prompt, modelo, proveedor)
      - Agrega "Hola" como AiMemoryEntry (rol: USER)
      - Construye historial: [system prompt] + [memoria reciente]
      - Llama a OpenAI/Anthropic
      - Recibe respuesta: "Hola! En que puedo ayudarte?"
      - Guarda respuesta como AiMemoryEntry (rol: ASSISTANT)
        |
6. ResponseDispatcherService.dispatch():
   - Descifra credenciales del canal WhatsApp
   - WhatsAppSender envia la respuesta via Meta Graph API
   - Crea mensaje OUTBOUND en BD
   - Registra ActionLog
        |
7. El cliente ve "Hola! En que puedo ayudarte?" en WhatsApp
```

---

## Modelo Multi-Tenant

Cada **Tenant** es una organizacion (empresa) con sus propios:
- Usuarios (OWNER, ADMIN, AGENT)
- Canales (su propio WhatsApp, su propio Telegram, etc.)
- Contactos (sus clientes)
- Conversaciones y mensajes
- Configuracion de IA (su propio prompt, modelo, etc.)

El aislamiento se logra asi:
1. El JWT contiene `tenantId`
2. `TenantGuard` lo extrae y lo adjunta al request
3. Todos los queries a BD filtran por `tenantId`
4. Un tenant nunca puede ver datos de otro

---

## Seguridad en Capas

| Capa | Mecanismo | Donde |
|---|---|---|
| **Transporte** | Helmet (headers), CORS | `main.ts` |
| **Rate limiting** | 100 req/min por IP | `ThrottlerModule` en `app.module.ts` |
| **Autenticacion** | JWT Bearer token | `JwtAuthGuard` |
| **Autorizacion** | Roles (OWNER/ADMIN/AGENT) | `RolesGuard` + `@Roles()` |
| **Multi-tenancy** | TenantId en JWT + filtro en queries | `TenantGuard` |
| **Validacion** | class-validator (whitelist, forbid non-whitelisted) | `ValidationPipe` global |
| **Cifrado de datos** | AES-256-GCM para credenciales de canal | `crypto.util.ts` |
| **Firma de webhooks** | HMAC-SHA256 (Meta) / Secret token (Telegram) | Adapters |
| **Sanitizacion** | Strip HTML, normalize unicode | `text-cleaner.util.ts` |

---

## Base de Datos: Modelos y Relaciones Clave

```
Tenant
├── User[]              (miembros del equipo)
├── Channel[]           (canales conectados)
├── Contact[]           (clientes finales)
├── Conversation[]      (hilos de chat)
├── AiContext[]         (config de IA)
└── ContextFile[]       (archivos de conocimiento)

Conversation
├── Channel             (por que canal llego)
├── Contact             (quien es el cliente)
├── User?               (agente asignado, opcional)
├── Message[]           (mensajes del hilo)
└── AiMemoryEntry[]     (memoria de IA para este hilo)

Message
├── Conversation        (a que hilo pertenece)
└── Channel             (por que canal se envio/recibio)
```

### Enums importantes

- **ChannelType**: WHATSAPP, INSTAGRAM, MESSENGER, TELEGRAM, WEBCHAT
- **ConversationStatus**: ACTIVE, WAITING_HUMAN, CLOSED, ARCHIVED
- **MessageDirection**: INBOUND (cliente→sistema), OUTBOUND (sistema→cliente)
- **MessageContentType**: TEXT, IMAGE, AUDIO, VIDEO, DOCUMENT, LOCATION, STICKER, REACTION, TEMPLATE
- **MessageStatus**: RECEIVED, PROCESSING, PROCESSED, SENT, DELIVERED, READ, FAILED
- **AiProvider**: OPENAI, ANTHROPIC, CUSTOM
- **UserRole**: OWNER, ADMIN, AGENT
- **TenantPlan**: FREE, STARTER, PRO, ENTERPRISE

---

## Patrones de Diseno Utilizados

| Patron | Donde se aplica | Por que |
|---|---|---|
| **Adapter** | Webhook adapters (WhatsApp, Telegram, etc.) | Normalizar formatos dispares a una interfaz comun |
| **Factory** | `SenderFactory` | Crear el sender correcto segun el tipo de canal |
| **Strategy** | Proveedores de IA (OpenAI, Anthropic) | Intercambiar proveedores sin modificar el orquestador |
| **Pipeline** | Message processing steps | Descomponer un proceso complejo en pasos atomicos |
| **Repository** | PrismaService | Abstraer acceso a datos |
| **Decorator** | @CurrentUser, @CurrentTenant, @Roles | Extraer informacion del request de forma declarativa |
| **Guard** | JWT, Tenant, Roles | Proteger rutas de forma transversal |

---

## Archivos de Tests

| Archivo | Que testea |
|---|---|
| `auth/auth.service.spec.ts` | Registro, login, refresh, perfil (7 tests) |
| `ai-engine/ai-engine.service.spec.ts` | Proveedores IA, fallback, memoria (6 tests) |
| `webhooks/adapters/whatsapp.adapter.spec.ts` | Firma HMAC, verificacion Meta, normalizacion (6 tests) |
| `shared/utils/crypto.util.spec.ts` | Encrypt/decrypt roundtrip, deteccion de tampering (4 tests) |
| `shared/utils/text-cleaner.util.spec.ts` | Strip HTML, sanitizacion, normalizacion unicode (6 tests) |
| `message-pipeline/steps/contact-resolver.spec.ts` | Upsert, scoping por tenant (3 tests) |

**Total: 33 tests** cubriendo las areas mas criticas del sistema.
