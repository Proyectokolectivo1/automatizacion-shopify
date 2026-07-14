# Estado del proyecto

Actualizado: 2026-07-14

## Estado general

`EN_DESARROLLO` — fundaciones funcionales en progreso; no listo para piloto ni producción.

Repositorio canónico público: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. La rama
`codex/foundations-e0-h2` contiene E1-H2A a E1-H5A validadas y publicadas.

## Fase actual

Fase 2 — Shopify simulado. E1-H1A a E1-H5A completadas; siguiente vertical E2-H1A de reglas de
tarifas y modalidades de pago simuladas.

## Avance aproximado por épica

| Épica                    | Avance | Evidencia                                         |
| ------------------------ | -----: | ------------------------------------------------- |
| E0 Fundaciones           |   98 % | identidad/DLQ completas; falta E0-H3B             |
| E1 Shopify               |   75 % | flujo simulado hasta conciliación y reproceso     |
| E2 Pagos y tarifas       |    0 % | pendiente                                         |
| E3 WhatsApp              |    0 % | bloqueada por credenciales                        |
| E4 Mastershop            |    0 % | bloqueada por contrato del proveedor              |
| E5 Impresión             |    0 % | pendiente inventario de impresoras                |
| E6 Operación y dashboard |    0 % | pendiente                                         |
| E7 Finanzas              |    0 % | pendiente decisiones contables                    |
| E8 Publicidad            |    0 % | bloqueada por credenciales y modelo de atribución |
| E9 Producción            |    0 % | no autorizada                                     |

## Diagnóstico inicial

- El repositorio se recibió vacío, con `.git`, sin aplicación, dependencias, pruebas ni CI.
- La especificación maestra de 3.268 líneas y el prompt maestro adjunto fueron leídos completamente.
- Herramientas detectadas: Node 22.16.0, pnpm 10.25.0, Docker 29.1.3 y Compose 5.0.1.

## Completado

- E0-H1: monorepo pnpm/Turborepo, TypeScript strict, NestJS, Next.js, CI y quality gates.
- E0-H2: PostgreSQL, Redis y MinIO locales autenticados, persistentes y limitados a localhost.
- E0-H3: configuración validada con Zod; logs JSON Pino con redacción; correlation ID; errores seguros.
- Métricas Prometheus con etiquetas acotadas y readiness real de PostgreSQL, Redis y MinIO.
- Prueba de fallo y recuperación de Redis, pruebas unitarias/integración y verificación runtime en CI.
- Contrato, arquitectura, seguridad, estrategia de pruebas y runbook de observabilidad documentados.
- E0-H4A: Prisma 7.8.0, migración expand-only y tablas base con constraints e índices.
- E0-H4B: lifecycle Prisma, transacción/idempotencia/outbox, BullMQ, worker, reintentos y DLQ.
- Tres migraciones expand-only y tabla `job_executions`; fallo Redis y recuperación probados.
- E0-H5A: Argon2id, sesiones opacas/rotativas, rate limit, RBAC multi-tenant y auditoría.
- Adaptador de correo bloqueado/simulado y métricas de autenticación sin secretos.
- E0-H5B: invitaciones y recuperación de un uso, expirables/revocables y consumo atómico.
- Vinculación segura de cuentas, jerarquía de rol, reset Argon2id y revocación total de sesiones.
- Migración probada desde vacío, reaplicación no-op, ausencia de drift y cliente Prisma real.
- Resumen ejecutivo `PROJECT_OVERVIEW.md` creado y exigido como actualización de cada sesión.
- E0-H4C: ownership por organización, backfill expand-only, entrega BullMQ versionada y DLQ operativa.
- Consulta paginada/redactada y reproceso idempotente owner/admin con carreras y tenant probados.
- Auditoría, métricas, flag y kill switch de operaciones cerrados por defecto.
- E0-H5C: bootstrap local del primer owner y administración tenant-safe de membresías/roles.
- Locks serializables, idempotencia, último owner, jerarquía y revocación de sesiones probados.
- E1-H1A: registro tenant-safe, mock Shopify v1, cifrado AES-256-GCM y ciclo de vida de tiendas.
- Rotación versionada, SSRF, duplicados, replay, RBAC, auditoría, métricas, flags y kill switch probados.
- E1-H2A: webhook `orders/create` sobre cuerpo crudo, HMAC constante, límite de tamaño y allowlist.
- Secreto webhook cifrado, idempotencia durable, detección de colisión, evento/outbox atómicos y worker.
- Fixture sintético versionado, flags, simulación, kill switch, métricas y documentación operativa.
- Caída y recuperación de Redis, carrera concurrente, replay, firma alterada y errores de parser probados.
- E1-H3A: consulta por `ShopifyProvider`, normalizador Zod v1 y persistencia tenant-safe de clientes,
  direcciones, pedidos e items.
- Dinero `BIGINT` en unidades menores, snapshots versionados, actualización monotónica y outbox
  `shopify.order.synchronized.v1` en transacción serializable.
- Carrera/replay, snapshot tardío, contrato inválido, caída Redis, recuperación y DLQ probados.
- E1-H4A: políticas de clasificación v1 por tienda, reglas priorizadas para prepago/COD y decisión
  fail-closed ante evidencia ausente, inválida o contradictoria.
- Máquina default-deny con historial inmutable `RECEIVED → VALIDATING → clasificación → destino`,
  outbox/auditoría atómicos, replay, carrera y pipeline Redis completo probados.
- E1-H5A: checkpoint por tienda, detección de faltantes/fallidos/atascados e incidencias deduplicadas.
- Inspección y reproceso tenant-safe con RBAC, idempotencia, outbox, auditoría, métricas y kill switch.
- Evento interno explícito sin HMAC fingido, replay concurrente y resolución posterior probados.

## Siguiente vertical

- E2-H1A: modelar reglas versionadas de tarifas y modalidades de pago en simulación, sin llamar
  Wompi, WhatsApp ni logística.

## Pendiente

- OpenTelemetry, alertas conectadas y restricción de `/metrics` antes de un despliegue real.
- Estados operativos Shopify posteriores y conexión real mientras falten credenciales.
- Backups, restore, carga, seguridad, piloto y producción.

## Bloqueos

- `BLOQUEADO_POR_SEGURIDAD`: el PAT enviado por conversación debe revocarse; no fue usado ni subido.
- `BLOQUEADO_POR_CREDENCIALES`: Shopify development, Wompi sandbox y Meta no suministrados.
- `BLOQUEADO_POR_PROVEEDOR`: contrato, autenticación, payloads y sandbox Mastershop no suministrados.
- `BLOQUEADO_POR_INVENTARIO`: modelos, drivers y papel de impresoras no suministrados.
- `BLOQUEADO_POR_HERRAMIENTA`: GitHub CLI (`gh`) no está instalado; el push funciona mediante el
  gestor seguro existente, pero no se automatizó la creación del PR.

## Riesgos destacados

- El Node local está por debajo del parche fijado para CI; debe actualizarse a 22.23.1.
- Una única VM constituye un punto único de fallo.
- MinIO comunitario está archivado y tiene riesgo conocido; se permite solo en desarrollo local.
- `/metrics` no tiene autenticación propia y debe quedar tras una red/proxy restringidos en producción.

## Pruebas

- `pnpm test`: 40 pruebas unitarias, 100 % en la lógica crítica incluida.
- `pnpm test:integration`: 3 pruebas de integración.
- `pnpm observability:verify`: readiness, correlación, métricas, redacción y fallo/recuperación Redis.
- `pnpm database:verify`: 8 pruebas sobre PostgreSQL real, Prisma, constraints y drift.
- `pnpm outbox:verify`: 4 pruebas PostgreSQL/Redis de atomicidad, carrera, recuperación y DLQ.
- `pnpm dlq:verify`: 5 pruebas PostgreSQL/Redis/HTTP de paginación, RBAC, tenant y replay.
- `pnpm auth:verify`: 14 pruebas HTTP/PostgreSQL de sesiones, RBAC, invitación y recuperación.
- `pnpm identity:verify`: 5 pruebas PostgreSQL/HTTP de bootstrap, RBAC, tenant, replay y sesiones.
- `pnpm shopify:verify`: 4 pruebas PostgreSQL/HTTP de registro, cifrado, tenant y ciclo de vida.
- `pnpm shopify:webhooks:verify`: 5 pruebas PostgreSQL/Redis/HTTP de HMAC, sync, recovery y DLQ.
- `pnpm shopify:orders:verify`: 4 pruebas PostgreSQL de carrera, actualización, tardíos y fail-closed.
- `pnpm orders:classification:verify`: 4 pruebas PostgreSQL de prepago, COD, replay, carrera y fail-closed.
- `pnpm shopify:reconciliation:verify`: 3 pruebas HTTP/PostgreSQL de detección, RBAC, replay y reproceso.
- GitHub Actions incluye el gate dedicado de reconciliación; su ejecución remota queda pendiente del PR.
- `pnpm validate`, `pnpm infra:verify` y `pnpm audit --prod`: verdes en la iteración.
- `pnpm validate` genera Prisma como primer paso y funciona sin artefactos generados previos.

## Errores conocidos

- No hay defectos abiertos en E0-H1 a E0-H5C ni E0-H4C.
- El primer CI remoto detectó que lint precedía a `prisma generate`; el quality gate quedó corregido
  para checkouts limpios y validado localmente desde el artefacto ausente.
- Los puertos host alternos son 5433, 6380, 9100 y 9101 para no interferir con servicios ajenos.
- Doce migraciones expand-only están verificadas desde vacío.

## Deuda técnica

Consulte `TECHNICAL_DEBT.md`. No se consideran implementados OpenTelemetry, alertas conectadas,
scheduler de conciliación, estados operativos posteriores ni integraciones reales.

## Siguiente paso

Implementar E2-H1A: reglas de tarifas y modalidades de pago versionadas, configurables y
default-deny con fixtures y pruebas contractuales. No iniciar cobros, mensajes, logística ni tráfico
real.
