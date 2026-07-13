# Reporte de pruebas

Actualizado: 2026-07-12

## Baseline inicial

El repositorio no tenía aplicación ni comandos. Herramientas detectadas: Node 22.16.0, pnpm
10.25.0, Docker 29.1.3 y Compose 5.0.1.

## Iteración E0-H1

| Validación          | Comando                          | Resultado            |
| ------------------- | -------------------------------- | -------------------- |
| Instalación         | `pnpm install --frozen-lockfile` | OK                   |
| Quality gate        | `pnpm validate`                  | OK                   |
| Unitarias/cobertura | `pnpm test`                      | OK, health 100 %     |
| Build               | `pnpm build`                     | OK, NestJS y Next.js |
| Auditoría           | `pnpm audit --prod`              | OK                   |
| Smoke API/web       | artefactos compilados            | OK                   |

Incidencias corregidas: `rootDir` de pruebas, configuración ESLint de Next.js, PostCSS vulnerable
transitivo y espera insuficiente del smoke web.

## Iteración E0-H2

| Validación    | Comando                             | Resultado              |
| ------------- | ----------------------------------- | ---------------------- |
| Configuración | `pnpm infra:config`                 | OK                     |
| Servicios     | `pnpm infra:verify`                 | OK, 3/3 saludables     |
| PostgreSQL    | `pg_isready` + `SELECT 1`           | OK, autenticado        |
| Redis         | `PING` autenticado / sin credencial | OK / `NOAUTH` esperado |
| MinIO         | health + operaciones S3 reales      | OK                     |
| Persistencia  | recreación conservando volúmenes    | OK, 3/3                |
| Bindings      | inspección Docker                   | OK, solo `127.0.0.1`   |
| Migraciones   | N/A                                 | NO_APLICA              |

Incidencias corregidas: Docker inicialmente apagado, lint de scripts JS, colisión de puertos y prueba
MinIO fortalecida para verificar un objeto mediante protocolo S3.

## Iteración E0-H3

| Validación              | Comando                     | Resultado                                 |
| ----------------------- | --------------------------- | ----------------------------------------- |
| Unitarias y cobertura   | `pnpm test`                 | OK, 6/6; 100 % en lógica crítica incluida |
| Integración HTTP        | `pnpm test:integration`     | OK, 3/3                                   |
| Formatter, lint y tipos | `pnpm validate`             | OK                                        |
| Build                   | `pnpm build`                | OK, API y web                             |
| Runtime observable      | `pnpm observability:verify` | OK                                        |
| Readiness inicial       | `GET /health/ready`         | 200; PostgreSQL, Redis y MinIO sanos      |
| Correlación             | request/response/error      | OK, header y cuerpo propagados            |
| Métricas                | `GET /metrics`              | OK, Prometheus y etiquetas acotadas       |
| Redacción               | logs capturados             | OK, sin Authorization ni PII de query     |
| Fallo Redis             | detener/reiniciar servicio  | 503 degradado y recuperación a 200        |
| Seguridad               | `pnpm audit --prod`         | OK, sin vulnerabilidades reportadas       |
| Migraciones             | N/A                         | NO_APLICA; comienzan en E0-H4A            |

### Fallos encontrados y corregidos

1. Tipos inseguros en pruebas y genérico del cliente Redis.
2. Aborto de Nest durante diagnóstico e inyección accidental del constructor de configuración.
3. Mezcla de suites unitarias/integración en cobertura.
4. Rama no cubierta en validación SSL; la lógica crítica quedó al 100 %.
5. La prueba runtime ahora exige degradación exclusiva de Redis y restaura siempre el servicio.

E0-H3 está completa. OpenTelemetry, alertas conectadas y protección productiva de `/metrics`
permanecen explícitamente pendientes en E0-H3B.

## Iteración E0-H4A

| Validación         | Comando                           | Resultado                           |
| ------------------ | --------------------------------- | ----------------------------------- |
| Schema Prisma      | `prisma validate`                 | OK, Prisma 7.8.0                    |
| Generación cliente | `prisma generate`                 | OK, generador CJS tipado            |
| Migración temporal | `pnpm database:verify`            | OK, 4/4 pruebas PostgreSQL real     |
| Base vacía         | `prisma migrate deploy`           | OK                                  |
| Reaplicación       | segundo `migrate deploy`          | OK, no-op; una migración registrada |
| Drift              | `prisma migrate diff --exit-code` | OK, sin diferencias                 |
| Cliente ORM        | Prisma + `@prisma/adapter-pg`     | OK, conexión y consulta reales      |
| FK/unique/checks   | inserts negativos PostgreSQL      | OK, SQLSTATE 23503/23505/23514      |
| Base local         | `pnpm database:migrate`           | OK, migración aplicada              |
| Estado local       | `pnpm database:status`            | OK, schema actualizado              |
| Seguridad deps     | `pnpm audit --prod`               | OK tras override Hono 1.19.13       |

### Fallos encontrados y corregidos

1. El test inicial usaba `import.meta` bajo el módulo CommonJS de la API; se reemplazó por resolución
   desde el directorio de trabajo sin cambiar la arquitectura de módulos.
2. La reinstalación expuso que FlatCompat resolvía plugins Next transitivos de forma accidental; los
   plugins requeridos quedaron como dependencias directas y versionadas del paquete web.
3. Los scripts de build Prisma bloqueados por la política pnpm quedaron limitados explícitamente a
   `prisma` y `@prisma/engines` mediante `onlyBuiltDependencies`.
4. La auditoría detectó GHSA-92pp-h63x-v22m en tooling transitivo de Prisma; el override exacto a
   `@hono/node-server` 1.19.13 eliminó el hallazgo sin introducir un servidor Hono en runtime.

La prueba crea y elimina una base aleatoria; no borra volúmenes ni datos de desarrollo. E0-H4A no
incluye publisher, locks, reintentos o DLQ.

## Iteración E0-H4B

| Validación                   | Comando                  | Resultado                                 |
| ---------------------------- | ------------------------ | ----------------------------------------- |
| Outbox PostgreSQL/Redis      | `pnpm outbox:verify`     | OK, 4/4                                   |
| Atomicidad e idempotencia    | transacción serializable | OK, commit/replay/conflicto/rollback      |
| Claim concurrente            | dos publishers           | OK, un solo job por UUID                  |
| Redis inaccesible/recuperado | puerto aislado real      | OK, fail-fast, estado retryable y publish |
| Reintentos y DLQ             | worker BullMQ real       | OK, 2 intentos y ejecución `dead_letter`  |
| Migraciones                  | `pnpm database:verify`   | OK, 4/4; tres migraciones y sin drift     |
| Unitarias                    | `pnpm test`              | OK, 8/8                                   |
| Tipos y lint de la API       | scripts del paquete      | OK                                        |

### Fallos encontrados y corregidos

1. PostgreSQL no permite referenciar un valor enum nuevo en la misma transacción; la ampliación del
   enum y las tablas runtime se separaron en migraciones consecutivas expand-only.
2. Prisma reportó SQLSTATE `40001` dentro de `P2010`; el retry serializable reconoce ambas formas y
   aplica espera incremental acotada.
3. La conexión BullMQ a Redis inaccesible seguía reintentando; ahora tiene timeout y retry strategy
   fail-fast, dejando el evento en PostgreSQL para recuperación.
4. Eventos asíncronos `active/completed/failed` podían competir entre sí; el registro durable pasó al
   cuerpo secuencial del processor.

La suite usa base y colas aleatorias, limpia sus recursos y no llama proveedores externos.
