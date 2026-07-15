# Estado del proyecto

Actualizado: 2026-07-14

## Estado general

`EN_DESARROLLO` — fundaciones funcionales en progreso; no listo para piloto ni producción.

Repositorio canónico público: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. La rama
`codex/foundations-e0-h2` contiene el avance validado hasta E3-H2A.

## Fase actual

Fase 4 — mensajería simulada en progreso. E3-H1A y E3-H2A están completas; la siguiente vertical es
E3-H3A, envío transaccional WhatsApp exclusivamente simulado.

## Avance aproximado por épica

| Épica                    | Avance | Evidencia                                            |
| ------------------------ | -----: | ---------------------------------------------------- |
| E0 Fundaciones           |   98 % | identidad/DLQ completas; falta E0-H3B                |
| E1 Shopify               |   75 % | flujo simulado hasta conciliación y reproceso        |
| E2 Pagos y tarifas       |   80 % | ciclo simulado completo hasta conciliación diaria    |
| E3 WhatsApp              |   29 % | conexión y plantillas simuladas; Meta real bloqueada |
| E4 Mastershop            |    0 % | bloqueada por contrato del proveedor                 |
| E5 Impresión             |    0 % | pendiente inventario de impresoras                   |
| E6 Operación y dashboard |    0 % | pendiente                                            |
| E7 Finanzas              |    0 % | pendiente decisiones contables                       |
| E8 Publicidad            |    0 % | bloqueada por credenciales y modelo de atribución    |
| E9 Producción            |    0 % | no autorizada                                        |

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
- E2-H1A: políticas de tarifa globales/por tienda, versionadas y activables, con vigencia y moneda COP.
- Resolución determinista/fail-closed, preview, RBAC, tenant, idempotencia, decisión durable, outbox,
  auditoría, métricas, modo simulación y kill switch probados.
- E2-H2A: `WompiProvider`, intención durable y checkout contractual con referencia, monto COP,
  expiración, firma SHA-256, host `.invalid`, RBAC, tenant, replay, auditoría, métricas y outbox.
- E2-H3A: webhook crudo, checksum/tiempo, eventos durables redactados, consulta authoritative,
  comparación financiera, estados, carrera/replay, métricas, outbox y kill switch probados.
- E2-H4A: dos ventanas durables +8/+16, scheduler concurrente, outbox único, auditoría, métricas,
  cancelación al aprobar/vencer, flags, simulación y kill switch probados.
- E2-H5A: vencimiento durable a 24 horas, estados/historial, política histórica `MARK`/`CANCEL`,
  scheduler concurrente, recordatorios cancelados, outbox, auditoría y métricas probados.
- Los estados terminales Wompi ya no se sobrescriben por eventos tardíos; una aprobación posterior al
  vencimiento abre `MANUAL_REVIEW` sin afirmar una cancelación Shopify inexistente.
- E2-H6A: checkpoint diario, reporte e incidencias Wompi tenant-safe; comparación contra último evento
  aceptado y proveedor simulado, dedupe, resolución, outbox, auditoría, métricas y fallo cerrado.
- Una caída authoritative crea un reporte fallido y reintento sin avanzar la ventana; ninguna
  diferencia corrige automáticamente la intención, el importe o el pedido.
- E3-H1A: `WhatsAppProvider` y fixture v1 deterministas; conexión por tienda, prueba, activación,
  desactivación y rotación de credenciales exclusivamente simuladas.
- Token AES-256-GCM con keyring propio y AAD tenant/tienda; forma de configuración y `phoneNumberId`
  único reforzados en PostgreSQL; RBAC, replay, carrera, outbox, auditoría y métricas probados.
- E3-H2A: catálogo tenant-safe con contrato/fixture v1, versiones inmutables, variables validadas,
  revisión local explícita y una activación por tienda/evento/idioma, sin tráfico Meta.
- Crear/versionar/revisar/activar/desactivar son idempotentes y serializables; PostgreSQL refuerza
  ownership, forma JSON, lifecycle e inmutabilidad; outbox/auditoría omiten cuerpo y variables.

## Siguiente vertical

- E3-H3A: envío transaccional WhatsApp exclusivamente simulado, sin llamadas Meta.

## Pendiente

- OpenTelemetry, alertas conectadas y restricción de `/metrics` antes de un despliegue real.
- Estados operativos Shopify posteriores y conexión real mientras falten credenciales.
- Backups, restore, carga, seguridad, piloto y producción.

## Bloqueos

- `BLOQUEADO_POR_SEGURIDAD`: el PAT enviado por conversación debe revocarse; no fue usado ni subido.
- `BLOQUEADO_POR_CREDENCIALES`: Shopify development, Wompi sandbox y Meta no suministrados.
- `BLOQUEADO_POR_PROVEEDOR`: contrato, autenticación, payloads y sandbox Mastershop no suministrados.
- `BLOQUEADO_POR_INVENTARIO`: modelos, drivers y papel de impresoras no suministrados.

## Riesgos destacados

- El Node local está por debajo del parche fijado para CI; debe actualizarse a 22.23.1.
- Una única VM constituye un punto único de fallo.
- MinIO comunitario está archivado y tiene riesgo conocido; se permite solo en desarrollo local.
- `/metrics` no tiene autenticación propia y debe quedar tras una red/proxy restringidos en producción.

## Pruebas

- `pnpm test`: 58 pruebas unitarias, 100 % en la lógica crítica incluida.
- `pnpm test:integration`: 3 pruebas de integración.
- `pnpm observability:verify`: readiness, correlación, métricas, redacción y fallo/recuperación Redis.
- `pnpm database:verify`: 13 pruebas sobre PostgreSQL real, 20 migraciones, constraints y cero drift.
- `pnpm outbox:verify`: 4 pruebas PostgreSQL/Redis de atomicidad, carrera, recuperación y DLQ.
- `pnpm dlq:verify`: 5 pruebas PostgreSQL/Redis/HTTP de paginación, RBAC, tenant y replay.
- `pnpm auth:verify`: 14 pruebas HTTP/PostgreSQL de sesiones, RBAC, invitación y recuperación.
- `pnpm identity:verify`: 5 pruebas PostgreSQL/HTTP de bootstrap, RBAC, tenant, replay y sesiones.
- `pnpm shopify:verify`: 4 pruebas PostgreSQL/HTTP de registro, cifrado, tenant y ciclo de vida.
- `pnpm shopify:webhooks:verify`: 5 pruebas PostgreSQL/Redis/HTTP de HMAC, sync, recovery y DLQ.
- `pnpm shopify:orders:verify`: 4 pruebas PostgreSQL de carrera, actualización, tardíos y fail-closed.
- `pnpm orders:classification:verify`: 4 pruebas PostgreSQL de prepago, COD, replay, carrera y fail-closed.
- `pnpm shopify:reconciliation:verify`: 3 pruebas HTTP/PostgreSQL de detección, RBAC, replay y reproceso.
- `pnpm transport-rates:verify`: 3 pruebas HTTP/PostgreSQL y 5 unitarias de políticas y resolución.
- `pnpm wompi:verify`: 17 pruebas PostgreSQL/HTTP y 4 contractuales; 21/21 en el ciclo Wompi.
- `pnpm whatsapp:verify`: 7 pruebas PostgreSQL/HTTP; 8 contractuales se ejecutan en `pnpm test`.
- GitHub Actions incluye los gates dedicados y el PR #1 estaba verde/sin conflictos al iniciar E3-H2A.
- En esta iteración `pnpm validate`, `pnpm infra:verify` y todos los gates funcionales están verdes;
  `pnpm audit --prod` quedó bloqueado porque el endpoint npm Audit respondió 410 retirado.
- La migración 20 fue aplicada a la base local persistente; `database:status` confirma esquema al día.
- `pnpm validate` genera Prisma como primer paso y funciona sin artefactos generados previos.

## Errores conocidos

- No hay defectos abiertos en E0-H1 a E0-H5C ni E0-H4C.
- El primer CI remoto detectó que lint precedía a `prisma generate`; el quality gate quedó corregido
  para checkouts limpios y validado localmente desde el artefacto ausente.
- Los puertos host alternos son 5433, 6380, 9100 y 9101 para no interferir con servicios ajenos.
- Veinte migraciones expand-only están verificadas desde vacío.

## Deuda técnica

Consulte `TECHNICAL_DEBT.md`. No se consideran implementados OpenTelemetry, alertas conectadas,
workers dedicados, estados operativos posteriores ni integraciones reales.

## Siguiente paso

Implementar E3-H3A: envío transaccional WhatsApp simulado, durable e idempotente que resuelva una
plantilla activa y valide/renderice variables sintéticas. No enviar mensajes ni iniciar tráfico Meta.
