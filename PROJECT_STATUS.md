# Estado del proyecto

Actualizado: 2026-07-12

## Estado general

`EN_DESARROLLO` — fundaciones funcionales en progreso; no listo para piloto ni producción.

## Fase actual

Fase 1 — Fundaciones. E0-H1, E0-H2 y E0-H3 completadas. Siguiente vertical: E0-H4A.

## Avance aproximado por épica

| Épica                    | Avance | Evidencia                                                                        |
| ------------------------ | -----: | -------------------------------------------------------------------------------- |
| E0 Fundaciones           |   50 % | monorepo, CI, entorno local y observabilidad; faltan datos, outbox, colas y RBAC |
| E1 Shopify               |    0 % | bloqueada por credenciales; aún sin mock contractual                             |
| E2 Pagos y tarifas       |    0 % | pendiente                                                                        |
| E3 WhatsApp              |    0 % | bloqueada por credenciales                                                       |
| E4 Mastershop            |    0 % | bloqueada por contrato del proveedor                                             |
| E5 Impresión             |    0 % | pendiente inventario de impresoras                                               |
| E6 Operación y dashboard |    0 % | pendiente                                                                        |
| E7 Finanzas              |    0 % | pendiente decisiones contables                                                   |
| E8 Publicidad            |    0 % | bloqueada por credenciales y modelo de atribución                                |
| E9 Producción            |    0 % | no autorizada                                                                    |

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

## En curso

- E0-H4A: Prisma, primera migración expand-only y esquema transaccional mínimo.

## Pendiente

- OpenTelemetry, alertas conectadas y restricción de `/metrics` antes de un despliegue real.
- Persistencia base, outbox, BullMQ, autenticación, RBAC e integraciones externas.
- Backups, restore, carga, seguridad, piloto y producción.

## Bloqueos

- `BLOQUEADO_POR_CREDENCIALES`: Shopify development, Wompi sandbox y Meta no suministrados.
- `BLOQUEADO_POR_PROVEEDOR`: contrato, autenticación, payloads y sandbox Mastershop no suministrados.
- `BLOQUEADO_POR_INVENTARIO`: modelos, drivers y papel de impresoras no suministrados.

## Riesgos destacados

- El Node local está por debajo del parche fijado para CI; debe actualizarse a 22.23.1.
- Una única VM constituye un punto único de fallo.
- MinIO comunitario está archivado y tiene riesgo conocido; se permite solo en desarrollo local.
- `/metrics` no tiene autenticación propia y debe quedar tras una red/proxy restringidos en producción.

## Pruebas

- `pnpm test`: 6 pruebas unitarias, 100 % en la lógica crítica incluida.
- `pnpm test:integration`: 3 pruebas de integración.
- `pnpm observability:verify`: readiness, correlación, métricas, redacción y fallo/recuperación Redis.
- `pnpm validate`, `pnpm infra:verify` y `pnpm audit --prod`: verdes en la iteración.

## Errores conocidos

- No hay defectos abiertos en E0-H1, E0-H2 o E0-H3.
- Los puertos host alternos son 5433, 6380, 9100 y 9101 para no interferir con servicios ajenos.
- No existen migraciones todavía; su estado es `NO_APLICA` hasta E0-H4A.

## Deuda técnica

Consulte `TECHNICAL_DEBT.md`. No se consideran implementados persistencia transaccional,
OpenTelemetry, alertas conectadas ni integraciones.

## Siguiente paso

Implementar E0-H4A: Prisma fijado, migración inicial expand-only, tablas `organizations`, `stores`,
`idempotency_keys` y `outbox_events`, restricciones e índices, con pruebas sobre PostgreSQL real. No
implementar todavía publicador outbox, pedidos ni lógica de proveedores.
