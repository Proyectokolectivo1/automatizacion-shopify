# Estado del proyecto

Actualizado: 2026-07-12

## Estado general

`EN_DESARROLLO` — fundaciones parcialmente funcionales; no listo para piloto ni producción.

## Fase actual

Fase 1 — Fundaciones. E0-H1 y E0-H2 completadas; siguiente vertical E0-H3.

## Avance aproximado por épica

| Épica                    | Avance | Evidencia                                                                        |
| ------------------------ | -----: | -------------------------------------------------------------------------------- |
| E0 Fundaciones           |   35 % | monorepo, CI y entorno local; faltan observabilidad, datos, outbox, colas y RBAC |
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

- Repositorio recibido vacío, con `.git`, sin commits y rama `master`.
- No existían aplicación, dependencias, pruebas, CI, migraciones ni documentación del proyecto.
- La especificación maestra de 3.268 líneas fue leída completamente.
- El prompt maestro fue suministrado y leído completamente desde el adjunto de Codex el 2026-07-12.
- Herramientas disponibles: Node 22.16.0, pnpm 10.25.0, Docker 29.1.3 y Compose 5.0.1.
- Baseline inicial: no aplicable; no había comandos ni código que ejecutar.

## Completado

- ADR-001 de monolito modular.
- Estructura pnpm workspaces + Turborepo.
- Configuración TypeScript strict, ESLint y Prettier.
- Esqueleto Next.js 15 y API NestJS 11 con health check.
- Prueba unitaria del health check y umbrales de cobertura.
- CI básica de instalación y validación completa.
- Diagrama Mermaid inicial y documentación operativa base.
- Lockfile reproducible y override de seguridad para PostCSS 8.5.10.
- Smoke tests sobre los artefactos compilados de API y web.
- E0-H2: Compose con PostgreSQL 17.10, Redis 7.4.9 y MinIO comunitario 2025-09-07.
- Secretos locales aleatorios, servicios autenticados, volúmenes y bindings exclusivos a localhost.
- Verificación automatizada de protocolos, bucket S3 y persistencia tras recrear contenedores.
- Runbook, arquitectura, seguridad y estrategia de pruebas de infraestructura local.

## En curso

- E0-H3: observabilidad base con logs estructurados, correlation ID, errores y métricas mínimas.

## Pendiente

- Prisma, migraciones, esquema base, outbox y BullMQ.
- Autenticación, RBAC y registro de integraciones.
- Todas las verticales de negocio e integraciones externas.
- Backups, restore, alertas, carga, seguridad, piloto y producción.

## Bloqueos

- `BLOQUEADO_POR_CREDENCIALES`: Shopify development, Wompi sandbox y Meta no suministrados.
- `BLOQUEADO_POR_PROVEEDOR`: contrato, autenticación, payloads y sandbox Mastershop no suministrados.
- `BLOQUEADO_POR_INVENTARIO`: modelos, drivers y papel de impresoras no suministrados.

## Riesgos destacados

- El Node local está por debajo del parche fijado para CI; debe actualizarse a 22.23.1.
- El presupuesto de USD 35 puede no incluir costos de mensajería, pagos, dominio y almacenamiento.
- Una única VM constituye un punto único de fallo.
- MinIO comunitario fue archivado y su imagen disponible está afectada por CVE-2026-33322 bajo OIDC;
  se permite solo en desarrollo local, sin OIDC y sin exposición de red.

## Pruebas

`pnpm validate` está verde: formatter, lint, typecheck, 1 prueba API, cobertura API 100 % y builds
NestJS/Next.js. `pnpm audit --prod` no reporta vulnerabilidades conocidas. Los smoke tests de ambos
artefactos compilados pasan. Consulte `TEST_REPORT.md` para limitaciones.

`pnpm infra:verify` confirma salud, autenticación y persistencia real de PostgreSQL, Redis y MinIO
después de eliminar y recrear contenedores sin eliminar volúmenes.

## Errores conocidos

- No hay defectos abiertos en E0-H1/E0-H2.
- Los puertos estándar 5432, 6379, 9000 y 9001 estaban ocupados por infraestructura externa; el
  proyecto usa 5433, 6380, 9100 y 9101 sin detener procesos ajenos.
- No existen migraciones todavía; su estado es `NO_APLICA` hasta E0-H4.

## Deuda técnica

Consulte `TECHNICAL_DEBT.md`. No se consideran implementados persistencia, observabilidad completa ni
integraciones.

## Siguiente paso

Implementar E0-H3: Pino, redacción de datos, correlation ID propagado, manejo global de errores,
métricas mínimas y health/readiness de dependencias con pruebas y runbook.
