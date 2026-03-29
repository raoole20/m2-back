# FASE 0 — Scaffolding y Docker (COMPLETADA)

**Fecha de finalización**: 2026-03-29

## Objetivo
Proyecto NestJS funcional integrado en Docker junto a los servicios existentes (PostgreSQL, Redis, n8n, Evolution API).

## Resumen de lo implementado

### 1. Estructura de directorios
Se crearon las carpetas base del monorepo:
```
m2-back/
├── api/          → Código NestJS
├── docs/         → Documentación
├── docker/       → Dockerfiles y configs de servicios
│   ├── api/
│   └── postgres/
├── scripts/      → Scripts utilitarios
```

Archivos reorganizados:
- `implementation-plan.md` → `docs/implementation-plan.md`
- `init-db.sh` → `docker/postgres/init-db.sh` (actualizado para crear 3 DBs)

### 2. Proyecto NestJS (api/)
- Scaffold con `@nestjs/cli` (TypeScript strict mode)
- Dependencias instaladas:
  - `@nestjs/config` — Configuración por entorno
  - `@nestjs/swagger` — Documentación OpenAPI
  - `@prisma/client` + `prisma` (v6) — ORM
  - `class-validator` + `class-transformer` — Validación de DTOs

### 3. Variables de entorno
- `.env.example` con todas las variables documentadas por sección
- `scripts/setup.sh` genera `.env` con secretos aleatorios via Node.js crypto
- `scripts/migrate.sh` y `scripts/seed.sh` como wrappers de Docker

### 4. Docker
- **Dockerfile** (`docker/api/Dockerfile`) — Multi-stage build:
  - `base` → Instala dependencias
  - `development` → Hot-reload con npm start:dev
  - `build` → Compila TypeScript + prisma generate
  - `production` → Imagen mínima con dist/ y prisma client
- **docker-compose.yml** actualizado:
  - Credenciales hardcodeadas reemplazadas por variables `${...}`
  - Servicio `api` agregado con dependencias de postgres y redis
  - Volúmenes `redis_storage` y `api_uploads` agregados
  - Healthchecks en postgres y redis
- **docker-compose.override.yml** — Hot-reload montando `./api/src` y `./api/prisma`

### 5. Schema de Prisma
11 modelos definidos en `api/prisma/schema.prisma`:

| Modelo | Tabla | Propósito |
|--------|-------|-----------|
| Tenant | tenants | Multitenancy |
| User | users | Usuarios por tenant |
| Channel | channels | Canales de comunicación |
| Contact | contacts | Contactos por tenant |
| Conversation | conversations | Conversaciones activas |
| Message | messages | Mensajes inbound/outbound |
| AiContext | ai_contexts | Configuración de IA por tenant |
| ContextFile | context_files | Archivos de contexto para IA |
| AiMemoryEntry | ai_memory_entries | Memoria conversacional |
| ActionLog | action_logs | Logs de acciones |
| WebhookLog | webhook_logs | Logs de webhooks entrantes |

### 6. Código de aplicación
- **PrismaModule** (`api/src/prisma/`) — Servicio global con connect/disconnect
- **AppConfigModule** (`api/src/config/`) — ConfigModule.forRoot global + configs de database y redis
- **HealthModule** (`api/src/health/`) — `GET /health` → `{ status: 'ok', timestamp }`
- **main.ts** — ValidationPipe global + Swagger en `/api/docs`

## Commits realizados

| Hash | Mensaje |
|------|---------|
| `f410263` | chore: create directory structure and reorganize existing files |
| `4debeb9` | feat: initialize NestJS project with core dependencies |
| `6f1cfd9` | feat: add environment configuration and utility scripts |
| `2511a24` | feat: add Docker configuration with multi-stage build |
| `6d0cd0a` | feat: add Prisma schema with all data models |
| `77e011f` | feat: add PrismaModule, config, Swagger, and health endpoint |

## Notas técnicas

- **Prisma 6** en lugar de 7: Prisma 7 eliminó el soporte de `url` en el datasource del schema. Prisma 6 es la versión LTS actual.
- **DATABASE_URL** se interpola en `docker-compose.yml` (no en `.env`, donde Docker Compose no interpola variables).
- `.gitattributes` con `*.sh text eol=lf` para evitar problemas de line endings en Windows.

## Verificación pendiente

Ejecutar manualmente:
```bash
docker compose up --build -d
docker compose exec api npx prisma migrate dev --name init
curl http://localhost:3000/health
# Swagger: http://localhost:3000/api/docs
```
