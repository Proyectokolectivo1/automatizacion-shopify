# Reporte de pruebas

Actualizado: 2026-07-14

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

## Iteración E0-H5A

| Validación             | Comando                | Resultado                                      |
| ---------------------- | ---------------------- | ---------------------------------------------- |
| Unitarias              | `pnpm test`            | OK, 17/17                                      |
| Auth HTTP + PostgreSQL | `pnpm auth:verify`     | OK, 6/6                                        |
| Password               | Argon2id               | OK, hash/verify/dummy y parámetros OWASP       |
| Sesiones               | access/refresh opaco   | OK, expiración, rotación, logout y replay      |
| Autorización           | guards backend         | OK, owner/read-only y tenant ajeno             |
| Abuso                  | intentos repetidos     | OK, respuesta uniforme, 429 y bloqueo temporal |
| Auditoría/métricas     | PostgreSQL/Prometheus  | OK, sin contraseña ni tokens                   |
| Correo                 | unitarias              | OK, blocked/simulated/fail-closed              |
| Migración temporal     | `pnpm database:verify` | OK, cuatro migraciones y sin drift             |

### Fallos encontrados y corregidos

1. El primer módulo Auth registraba otro Prisma; se integró en `AppModule` para conservar un solo pool.
2. La inyección de un tipo `Pick` se borraba en runtime; se fijó el token explícito de configuración.
3. La actividad de sesión escribía en cada request; ahora se actualiza como máximo una vez por minuto.
4. Rate limits vencidos podían crecer indefinidamente; se añadió limpieza periódica con retención acotada.

En ese corte no existían usuario predeterminado, registro público ni envío real de correo; la
invitación y recuperación se completan en la iteración siguiente.

## Iteración E0-H5B

| Validación                  | Comando                | Resultado                                     |
| --------------------------- | ---------------------- | --------------------------------------------- |
| Unitarias                   | `pnpm test`            | OK, 17/17                                     |
| Auth HTTP + PostgreSQL      | `pnpm auth:verify`     | OK, 14/14                                     |
| Migración/constraints       | `pnpm database:verify` | OK, 5/5; cinco migraciones y sin drift        |
| Invitación CSPRNG/solo hash | API + PostgreSQL       | OK, creación/vínculo/expiración/replay        |
| Roles y tenant              | guards + política      | OK, sin owner→owner, admin→admin ni cruce     |
| Consumo concurrente         | dos requests reales    | OK, exactamente un 200 y un 400               |
| Recuperación uniforme       | cuenta conocida/ajena  | OK, mismo 202                                 |
| Rotación y revocación       | Argon2id + sesiones    | OK, password anterior y sesiones invalidados  |
| Flags/kill switch           | segunda API aislada    | OK, 503 en invitación y 202 uniforme en reset |
| Correo                      | fixtures unitarios     | OK, blocked/simulated/fail-closed; sin red    |
| Auditoría/métricas          | PostgreSQL/Prometheus  | OK, sin correo, password o token en metadata  |

### Fallos encontrados y corregidos

1. `pg_advisory_xact_lock` devuelve el tipo PostgreSQL `void`, no deserializable por el adapter
   Prisma; la consulta conserva el lock y proyecta un booleano compatible.
2. La emisión concurrente se serializa por clave lógica; el consumo se serializa por fila con
   `FOR UPDATE`, evitando dobles usuarios/membresías y dobles resets.
3. El rate limit incorporó scope al hash para que login y recuperación no compartan accidentalmente
   el mismo contador.
4. La suite outbox expuso intermitencia al publicar inmediatamente eventos con timestamp por defecto;
   los fixtures ahora fijan `availableAt` vencido y restauran Redis antes de afirmar. Dos ejecuciones
   consecutivas de `pnpm outbox:verify` quedaron verdes.

El correo real, el bootstrap del primer owner y la administración general de roles no se presentan
como terminados. DP-001 sigue bloqueada y E0-H4C es la siguiente vertical.

## Iteración E0-H4C

| Validación                   | Comando                | Resultado                                     |
| ---------------------------- | ---------------------- | --------------------------------------------- |
| Quality gate completo        | `pnpm validate`        | OK; format, lint, tipos, 19 unitarias y build |
| Migración/constraints        | `pnpm database:verify` | OK, 5/5; seis migraciones y sin drift         |
| Outbox/worker                | `pnpm outbox:verify`   | OK, 4/4; evento y ejecución llegan a DLQ      |
| Operaciones HTTP/PG/Redis    | `pnpm dlq:verify`      | OK, 5/5                                       |
| Paginación/redacción         | API real               | OK, tenant propio y sin payload/PII           |
| RBAC/tenant                  | owner/read-only/ajeno  | OK, 200/403/403 y auditoría                   |
| Idempotencia/respuesta caída | requests concurrentes  | OK, mismo 202/snapshot y un solo efecto       |
| Carrera entre operadores     | claves distintas       | OK, exactamente un 202 y un 409               |
| Entrega nueva                | PostgreSQL + BullMQ    | OK, `eventId-v2`, sin colisión con v1         |
| Flags/kill switch            | unitarias              | OK, 503 cuando cualquiera cierra la operación |
| Auditoría/métricas           | PostgreSQL/Prometheus  | OK, labels acotadas y clave original ausente  |
| Backfill local               | consulta SQL           | OK, 0 eventos/jobs sin ownership              |

### Fallos encontrados y corregidos

1. BullMQ rechazó `:` en IDs personalizados; la versión de entrega usa el separador permitido `-v`.
2. El worker cambiaba `published → dead_letter` sin limpiar `published_at`, violando el check SQL;
   ambos estados durables se actualizan ahora dentro de una transacción compatible con constraints.
3. El reloj host estaba varios segundos adelantado frente a PostgreSQL; usar `new Date()` dejaba el
   replay pendiente en el futuro. La transición usa `NOW()` de la base bloqueada.
4. Las ejecuciones antiguas podían colisionar con un replay usando el UUID original. Cada reproceso
   incrementa `delivery_version`; los jobs tardíos no cambian una generación posterior.

No se usaron proveedores ni credenciales externas. E0-H4C queda completa; E0-H5C es la siguiente
vertical y E0-H3B continúa pendiente.

## Iteración E0-H5C

Fecha: 2026-07-14.

| Gate                              | Comando                                  | Resultado                            |
| --------------------------------- | ---------------------------------------- | ------------------------------------ |
| Unitarias y controles fail-closed | `pnpm test`                              | OK, 24/24; cobertura incluida 100 %  |
| Identidad HTTP + PostgreSQL       | `pnpm identity:verify`                   | OK, 5/5                              |
| Tipos API                         | `pnpm --filter @ecommerce/api typecheck` | OK                                   |
| Lint API                          | `pnpm --filter @ecommerce/api lint`      | OK                                   |
| Quality gate completo             | `pnpm validate`                          | OK, format/lint/typecheck/test/build |
| Integración API                   | `pnpm test:integration`                  | OK, 3/3                              |
| Migración/constraints             | `pnpm database:verify`                   | OK, 5/5; seis migraciones, sin drift |
| Outbox                            | `pnpm outbox:verify`                     | OK, 4/4                              |
| DLQ                               | `pnpm dlq:verify`                        | OK, 5/5                              |
| Auth regresión                    | `pnpm auth:verify`                       | OK, 14/14                            |
| Estado de esquema                 | `pnpm database:status`                   | OK, schema actualizado               |
| Observabilidad                    | `pnpm observability:verify`              | OK, caída/recuperación Redis         |
| Dependencias                      | `pnpm audit --prod`                      | OK, cero vulnerabilidades conocidas  |
| Infraestructura                   | `pnpm infra:verify`                      | OK, salud y persistencia             |

La suite dedicada crea una base aleatoria, aplica seis migraciones y prueba bootstrap concurrente,
ausencia de secretos en persistencia, paginación, tenant, RBAC, auto-mutación, escalamiento,
protección del último owner, clave idempotente hashada, replay, carreras y revocación inmediata de
sesiones. El primer intento unitario usó una opción Vitest inexistente (`--runInBand`); se corrigió el
comando. Luego la nueva rama de normalización bajó temporalmente coverage de branches a 80 %; se
añadieron casos de valores opcionales vacíos/configurados y quedó en 100 %.

El primer quality gate encontró cinco accesos `any` en la aserción de la nueva lista HTTP. Se añadió
un contrato tipado para esa respuesta y la siguiente ejecución de `pnpm validate` quedó verde.

No hubo migración nueva: E0-H5C reutiliza membresías, sesiones, auditoría e idempotencia ya
versionadas. No se usaron credenciales ni proveedores externos. La conexión real Shopify continúa
`BLOQUEADO_POR_CREDENCIALES`; la siguiente vertical es E1-H1A con adaptador y mock contractual.
