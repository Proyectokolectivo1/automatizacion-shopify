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

## Publicación en GitHub

Fecha: 2026-07-14.

- Remoto: `https://github.com/Proyectokolectivo1/automatizacion-shopify.git`.
- Rama remota: `main`.
- Escaneo de patrones sensibles en `HEAD`: 0 candidatos.
- Escaneo del historial Git completo: 0 candidatos.
- `.env` confirmado como ignorado.
- El PAT compartido en la conversación no se usó, no se guardó y debe revocarse.

### Corrección del quality gate en checkout limpio

- GitHub Actions expuso que `lint` se ejecutaba antes de generar el cliente Prisma ignorado por Git.
- `pnpm validate` ahora comienza con `pnpm prisma:generate` y no depende del estado previo del equipo.
- Verificación local: se eliminó únicamente el artefacto generado
  `apps/api/src/generated/prisma` y `pnpm validate` lo regeneró correctamente.
- Resultado: formatter, lint, typecheck, 24 pruebas unitarias con 100 % de cobertura y builds API/web
  en verde.

## Iteración E1-H1A

Fecha: 2026-07-14.

| Validación                    | Comando                                         | Resultado                            |
| ----------------------------- | ----------------------------------------------- | ------------------------------------ |
| Quality gate completo         | `pnpm validate`                                 | OK, format/lint/typecheck/test/build |
| Contrato, cifrado y controles | `pnpm test`                                     | OK, 30/30; cobertura incluida 100 %  |
| Shopify HTTP + PostgreSQL     | `pnpm shopify:verify`                           | OK, 4/4                              |
| Migraciones y constraints     | `pnpm database:verify`                          | OK, 6/6; ocho migraciones, sin drift |
| Esquema local                 | `pnpm database:migrate && pnpm database:status` | OK, actualizado                      |
| Lint y tipos API              | scripts del paquete                             | OK                                   |

Regresión completa: integración HTTP, outbox, DLQ, auth, identidad y observabilidad en verde.
`pnpm audit --prod` reportó cero vulnerabilidades e `pnpm infra:verify` conservó persistencia y salud.

La suite prueba registro concurrente, replay, duplicado, SSRF, RBAC, tenant ajeno, ciphertext sin
token, AAD, keyring v1→v2, prueba saludable, activación, desactivación, rotación, mock inválido,
auditoría, métricas, flags y kill switch. No realizó tráfico externo.

Fallos encontrados y corregidos:

1. Prisma esperaba otro nombre para la FK compuesta; se fijó el nombre explícito y quedó sin drift.
2. El primer constraint aceptaba campos JSON adicionales; una migración correctiva forward-only exige
   exactamente `version`, `iv`, `authTag` y `ciphertext`.
3. PostgreSQL no ofrece `jsonb_object_length` en este entorno; el chequeo se reescribió con operadores
   de existencia y resta de claves. La migración fallida local se marcó rollback y se reaplicó verde.

E1-H1A está completa solo en simulación. La conexión real permanece
`BLOQUEADO_POR_CREDENCIALES`; la siguiente vertical es E1-H2A.

CI remoto `29364969334`: todas las etapas verdes, incluida Shopify. La advertencia de runtime Node 20
de las acciones se corrigió actualizando a `checkout@v6.0.2`, `setup-node@v6.0.0` y
`pnpm/action-setup@v4.4.0`, versiones oficiales basadas en Node 24.

## Iteración E1-H2A

Fecha: 2026-07-14.

| Validación                | Comando                        | Resultado                             |
| ------------------------- | ------------------------------ | ------------------------------------- |
| Quality gate completo     | `pnpm validate`                | OK, format/lint/typecheck/test/build  |
| Unitarias                 | `pnpm test`                    | OK, 32/32; cobertura incluida 100 %   |
| Integración API           | `pnpm test:integration`        | OK, 3/3                               |
| Migraciones y constraints | `pnpm database:verify`         | OK, 7/7; nueve migraciones, sin drift |
| Outbox                    | `pnpm outbox:verify`           | OK, 4/4                               |
| DLQ                       | `pnpm dlq:verify`              | OK, 5/5                               |
| Auth                      | `pnpm auth:verify`             | OK, 14/14                             |
| Identidad                 | `pnpm identity:verify`         | OK, 5/5                               |
| Shopify registro          | `pnpm shopify:verify`          | OK, 4/4                               |
| Shopify webhook           | `pnpm shopify:webhooks:verify` | OK, 4/4                               |
| Estado de esquema         | `pnpm database:status`         | OK, nueve migraciones aplicadas       |
| Observabilidad            | `pnpm observability:verify`    | OK, caída/recuperación Redis          |
| Dependencias productivas  | `pnpm audit --prod`            | OK, cero vulnerabilidades conocidas   |
| Infraestructura           | `pnpm infra:verify`            | OK, salud y persistencia              |

La suite dedicada verifica firma válida e inválida sobre bytes crudos, orden HMAC-antes-de-JSON,
body alterado, JSON inválido, límite de 256 KiB, allowlist, tienda activa, secreto cifrado, replay,
carrera concurrente, colisión de ID con otro payload, respuesta rápida, outbox/worker y recuperación
después de Redis inaccesible. La base solo conserva hash y resumen redactado, no HMAC ni cuerpo.

Fallos encontrados y corregidos durante la vertical:

1. La prueba de recuperación intentaba republicar antes de vencer el backoff; se aisló el evento y se
   controló `available_at` de forma determinista.
2. El error `PayloadTooLargeError` del parser se convertía en 500; el filtro global ahora reconoce
   únicamente la forma segura `entity.too.large` y responde 413.
3. La observabilidad se registraba después del parser, por lo que un 413 no tenía correlation ID; el
   middleware se movió al inicio del pipeline HTTP y el caso quedó cubierto.
4. El test construía el runtime outbox con un cliente Prisma distinto al lifecycle Nest; ahora usa el
   `PrismaService` administrado por la aplicación.

No se contactó Shopify ni se almacenó PII real. El registro remoto del webhook y la consulta real del
pedido permanecen `BLOQUEADO_POR_CREDENCIALES`. La siguiente vertical es E1-H3A.

La publicación no se realizó: el flujo de entrega detectó que `gh` no está instalado. Los cambios
permanecen sin commit en `codex/foundations-e0-h2`, basados exactamente en `origin/main`; no se usó el
PAT expuesto. Debe instalarse y autenticarse GitHub CLI antes de crear rama/commit/push/PR.

## Iteración E1-H3A

Fecha: 2026-07-14.

| Validación               | Comando                        | Resultado                            |
| ------------------------ | ------------------------------ | ------------------------------------ |
| Quality gate completo    | `pnpm validate`                | OK, format/lint/typecheck/test/build |
| Unitarias                | `pnpm test`                    | OK, 35/35; cobertura incluida 100 %  |
| Integración API          | `pnpm test:integration`        | OK, 3/3                              |
| Migraciones/constraints  | `pnpm database:verify`         | OK, 8/8; diez migraciones, sin drift |
| Outbox                   | `pnpm outbox:verify`           | OK, 4/4                              |
| DLQ                      | `pnpm dlq:verify`              | OK, 5/5                              |
| Auth                     | `pnpm auth:verify`             | OK, 14/14                            |
| Identidad                | `pnpm identity:verify`         | OK, 5/5                              |
| Registro Shopify         | `pnpm shopify:verify`          | OK, 4/4                              |
| Webhook + Redis + worker | `pnpm shopify:webhooks:verify` | OK, 5/5; sync, recovery y DLQ        |
| Pedido normalizado       | `pnpm shopify:orders:verify`   | OK, 4/4                              |
| Estado de esquema        | `pnpm database:status`         | OK, diez migraciones aplicadas       |
| Observabilidad           | `pnpm observability:verify`    | OK, caída/recuperación Redis         |
| Dependencias productivas | `pnpm audit --prod`            | OK, cero vulnerabilidades conocidas  |
| Infraestructura          | `pnpm infra:verify`            | OK, salud y persistencia             |

La suite confirma normalización estricta, dinero `BIGINT`, cliente/dirección/items, carrera y replay,
actualización monotónica, rechazo de snapshot tardío, contrato inválido, kill switch, consulta por
adaptador, outbox atómico y recurso inexistente a DLQ. La prueba del pipeline detiene la entrega a
Redis, recupera y verifica el pedido completo antes de marcar el webhook procesado.

Fallos encontrados y corregidos:

1. Prisma exigió unicidad compuesta en el lado definidor de la relación webhook→pedido; se añadió el
   constraint tenant completo y quedó sin drift.
2. La primera expectativa de tablas ubicaba `organizations` antes de `orders`; se corrigió al orden
   real de PostgreSQL, sin cambios de esquema.
3. El fixture incluía `financial_status` fuera del schema estricto; se incorporó como dato validado
   pero sin clasificar, porque esa decisión pertenece a E1-H4A.
4. Lint detectó un import y un argumento de contrato no usados en la suite nueva; fueron eliminados.

No hubo tráfico externo ni PII real. E1-H3A está completa solo en simulación. E1-H4A es la siguiente
vertical y la conexión Shopify real sigue `BLOQUEADO_POR_CREDENCIALES`.

## Iteración E1-H4A

Fecha: 2026-07-14.

| Validación                   | Comando                             | Resultado                             |
| ---------------------------- | ----------------------------------- | ------------------------------------- |
| Quality gate completo        | `pnpm validate`                     | OK, format/lint/typecheck/test/build  |
| Unitarias                    | `pnpm test`                         | OK, 40/40; cobertura incluida 100 %   |
| Integración API              | `pnpm test:integration`             | OK, 3/3                               |
| Migraciones/constraints      | `pnpm database:verify`              | OK, 8/8; once migraciones, sin drift  |
| Outbox                       | `pnpm outbox:verify`                | OK, 4/4                               |
| DLQ                          | `pnpm dlq:verify`                   | OK, 5/5                               |
| Auth                         | `pnpm auth:verify`                  | OK, 14/14                             |
| Identidad                    | `pnpm identity:verify`              | OK, 5/5                               |
| Registro Shopify             | `pnpm shopify:verify`               | OK, 4/4                               |
| Webhook + pipeline Redis     | `pnpm shopify:webhooks:verify`      | OK, 5/5; termina clasificado          |
| Pedido normalizado           | `pnpm shopify:orders:verify`        | OK, 4/4                               |
| Clasificación                | `pnpm orders:classification:verify` | OK, 4/4                               |
| Estado de esquema            | `pnpm database:status`              | OK, once migraciones aplicadas        |
| Observabilidad               | `pnpm observability:verify`         | OK, caída/recuperación Redis          |
| Dependencias productivas     | `pnpm audit --prod`                 | OK, cero vulnerabilidades conocidas   |
| Configuración Compose        | `pnpm infra:config`                 | OK                                    |
| Infraestructura/persistencia | `pnpm infra:verify`                 | OK, servicios, protocolos y volúmenes |

La suite confirma reglas v1 por tienda, prioridad determinista, prepago, COD y fail-closed ante
ausencia/contradicción. Cada decisión recorre tres transiciones válidas, conserva historial
inmutable y emite outbox/auditoría atómicos. La carrera concurrente produce un único efecto y un
replay; el pipeline recupera Redis entre webhook y pedido, y procesa después el evento de
clasificación hasta `READY_FOR_LOGISTICS`.

Fallos encontrados y corregidos:

1. La prueba de migración conservaba el conteo anterior de diez migraciones; se actualizó a once y
   se añadieron constraints de política activa única e historial inmutable.
2. Dos transacciones serializables concurrentes podían observar el snapshot anterior después de
   esperar el advisory lock y chocar con el unique del historial; el retry acotado ahora reconoce
   esa colisión, abre un snapshot nuevo y devuelve replay sin duplicar efectos.
3. El retorno del callback transaccional ensanchaba literales y bloqueó el primer `typecheck` global;
   se tipó el callback con `OrderClassificationResult` y el quality gate completo quedó verde.

No hubo tráfico externo ni PII real. E1-H4A está completa solo en simulación. E1-H5A es la siguiente
vertical y la conexión Shopify real sigue `BLOQUEADO_POR_CREDENCIALES`.

## Iteración E1-H5A

Fecha: 2026-07-14.

| Validación              | Comando                                  | Resultado                            |
| ----------------------- | ---------------------------------------- | ------------------------------------ |
| Generación Prisma       | `pnpm prisma:generate`                   | OK                                   |
| Typecheck API           | `pnpm --filter @ecommerce/api typecheck` | OK                                   |
| Lint API                | `pnpm --filter @ecommerce/api lint`      | OK, cero advertencias                |
| Migraciones/constraints | `pnpm database:verify`                   | OK, 8/8; doce migraciones, sin drift |
| Reconciliación          | `pnpm shopify:reconciliation:verify`     | OK, 3/3 HTTP/PostgreSQL              |
| Quality gate completo   | `pnpm validate`                          | OK, format/lint/types/40 unit/build  |
| Integración base        | `pnpm test:integration`                  | OK, 3/3                              |
| Outbox / DLQ            | `pnpm outbox:verify`; `pnpm dlq:verify`  | OK, 4/4 y 5/5                        |
| Auth / identidad        | gates dedicados                          | OK, 14/14 y 5/5                      |
| Registro/webhook/pedido | gates Shopify dedicados                  | OK, 4/4, 5/5 y 4/4                   |
| Clasificación           | `pnpm orders:classification:verify`      | OK, 4/4                              |
| Estado de esquema       | `pnpm database:status`                   | OK, doce migraciones aplicadas       |
| Observabilidad          | `pnpm observability:verify`              | OK, caída y recuperación Redis       |
| Dependencias            | `pnpm audit --prod`                      | OK, cero vulnerabilidades conocidas  |
| Infraestructura         | `pnpm infra:config`; `pnpm infra:verify` | OK, salud y persistencia             |

La suite confirma checkpoint y ventana por tienda, detección deduplicada de pedido faltante,
webhook fallido y pedido atascado, inspección redactada, RBAC para operaciones y aislamiento tenant.
Dos reprocesos concurrentes producen un único evento interno/outbox; el pedido se sincroniza por el
pipeline existente y una ejecución posterior resuelve la incidencia. Un webhook dead letter rearma
solo su entrega y aumenta `delivery_version`.

Fallos encontrados y corregidos:

1. El constraint heredado exigía firma válida para todo webhook; se reemplazó hacia adelante por
   exclusión mutua entre HMAC válido y origen interno explícito, sin fingir autenticidad externa.
2. PostgreSQL devolvía el retry serializable `40001` anidado por el driver Prisma; el detector ahora
   reconoce ambos formatos y mantiene el límite de reintentos.
3. Lint detectó acceso inseguro a un cuerpo HTTP no tipado en la prueba; se añadió el narrowing
   explícito y el gate quedó sin advertencias.

No hubo tráfico externo ni PII real. E1-H5A está completa solo en simulación; el scheduler y Shopify
real permanecen pendientes/bloqueados. E2-H1A es la siguiente vertical.

## Iteración E2-H1A

Fecha: 2026-07-14.

| Validación                | Comando                                  | Resultado                                       |
| ------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Instalación reproducible  | `pnpm install --frozen-lockfile`         | OK                                              |
| Quality gate completo     | `pnpm validate`                          | OK: format/lint/types/45 unit/build             |
| Tarifas                   | `pnpm transport-rates:verify`            | OK: 5 unitarias + 3 HTTP/PostgreSQL             |
| Migraciones/constraints   | `pnpm database:verify`                   | OK: 9/9, 13 migraciones, reaplicación y drift   |
| Migración local/estado    | gates de base de datos                   | OK: migración 13 aplicada y esquema al día      |
| Integración y regresiones | diez gates dedicados                     | OK: base, outbox, DLQ, auth, identidad, Shopify |
| Observabilidad            | `pnpm observability:verify`              | OK: caída/recuperación Redis                    |
| Infraestructura           | `pnpm infra:config`; `pnpm infra:verify` | OK: salud, recreación y persistencia            |
| Auditoría de dependencias | `pnpm audit --prod`                      | BLOQUEADO_POR_PROVEEDOR: npm Audit HTTP 410     |

La vertical prueba resolución por prioridad, especificidad y alcance, vigencia semiabierta,
normalización `es-CO`, ausencia/contradicción fail-closed, activación única por alcance, RBAC,
tenant isolation, replay, carrera y persistencia atómica de decisión, pedido y outbox.

Fallos encontrados y corregidos:

1. Prisma rechazó la creación anidada de reglas con el campo tenant explícito; política y reglas se
   crean ahora separadamente dentro de la misma transacción.
2. Dos llamadas con la misma clave retornaban cuerpos distintos por una etiqueta de replay; la
   respuesta idempotente ahora es byte-estable, sin perder la métrica de replay.
3. `migrate diff` detectó una FK compuesta SQL no representada en Prisma; el schema ahora expresa la
   relación organización+política+regla y volvió a cero drift.
4. El registro npm retiró el endpoint Audit consumido por pnpm 10.25.0. No se interpretó el HTTP 410
   como suite verde ni como vulnerabilidad; el gate externo queda pendiente de restauración/migración
   controlada de toolchain.
5. La revisión detectó que dos claves distintas podían reactivar la misma política con una lectura
   previa al lock; la política se relee dentro del lock y una prueba concurrente garantiza un evento.

No hubo tráfico a Shopify, Wompi, WhatsApp o Mastershop ni PII real. Wompi queda
`BLOQUEADO_POR_CREDENCIALES`; Mastershop queda `BLOQUEADO_POR_PROVEEDOR`.

## Iteración E2-H2A

Fecha: 2026-07-14.

| Validación              | Comando                | Resultado                               |
| ----------------------- | ---------------------- | --------------------------------------- |
| Contrato e integración  | `pnpm wompi:verify`    | OK: 2 contractuales + 4 HTTP/PostgreSQL |
| Migraciones/constraints | `pnpm database:verify` | OK: 10/10, 14 migraciones y cero drift  |
| Typecheck inicial       | gate API               | OK                                      |
| Quality gate integral   | `pnpm validate`        | OK: format/lint/types/47 unit/build     |

Las pruebas confirman concatenación de firma referencia+monto+COP+expiración, parámetros Web
Checkout, host `.invalid`, RBAC, tenant, una sola intención pendiente, replay concurrente y outbox
único. La API deriva monto/referencia de datos durables y rechaza pedidos sin tarifa COD resuelta.
Durante el cierre se detectó que la validación estricta rechazaba también la ausencia legítima de
cuerpo HTTP; se normalizó `undefined` a `{}` manteniendo el rechazo de cualquier campo adicional y
se repitieron tanto `pnpm wompi:verify` como `pnpm validate` en verde.

No hubo llamadas a Wompi ni credenciales reales. Webhook, consulta authoritative, confirmación,
expiración operativa y conciliación permanecen pendientes; E2-H3A es la siguiente vertical.

GitHub CLI 2.96.0 quedó disponible y autenticado por keyring. E2-H1A se publicó como commit
`482fb71` y se abrió el PR borrador #1 sin usar el PAT expuesto.
