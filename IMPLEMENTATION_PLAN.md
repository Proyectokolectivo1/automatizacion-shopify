# Plan de implementación

Actualizado: 2026-07-12

| Fase | Vertical demostrable               | Estado                     | Criterio de salida                                     |
| ---- | ---------------------------------- | -------------------------- | ------------------------------------------------------ |
| 0    | Descubrimiento técnico y contratos | PARCIAL                    | Inventario de accesos, proveedores e impresoras        |
| 1A   | E0-H1 monorepo, estándares y CI    | COMPLETADA                 | install, quality gate, audit y smoke verdes            |
| 1B   | E0-H2 entorno local                | COMPLETADA                 | protocolos, auth, salud y persistencia probados        |
| 1C   | E0-H3 observabilidad base          | SIGUIENTE                  | logs, correlation ID, errores, métricas y readiness    |
| 1D   | E0-H4 datos, outbox y colas        | PENDIENTE                  | migración, transacción y publicación probadas          |
| 1E   | E0-H5 autenticación y RBAC         | PENDIENTE                  | sesión segura y permisos backend probados              |
| 2    | Shopify mínimo                     | BLOQUEADO_POR_CREDENCIALES | webhook idempotente, pedido, timeline y conciliación   |
| 3    | COD + Wompi + WhatsApp             | BLOQUEADO_POR_CREDENCIALES | link, mensaje, confirmación y vencimiento simulables   |
| 4    | Mastershop                         | BLOQUEADO_POR_PROVEEDOR    | mock primero; guía y tracking reales solo con contrato |
| 5    | Impresión                          | BLOQUEADO_POR_INVENTARIO   | agente, PDF, spool y reimpresión auditada              |
| 6    | Operación y dashboard              | PENDIENTE                  | filtros, alertas, métricas y exportación               |
| 7    | Rentabilidad y publicidad          | BLOQUEADO_POR_DECISION     | snapshots, atribución con confianza y ROAS             |
| 8    | Hardening y lanzamiento            | PENDIENTE                  | carga, seguridad, restore, piloto y aprobación humana  |

## Primera vertical: E0-H1

Actor: desarrollador. Entrada: checkout limpio. Salida: web y API compilables con una única orden de
validación. Efecto: habilita iteraciones reproducibles; no produce efectos externos.

Criterios de aceptación:

1. `pnpm install --frozen-lockfile` funciona desde un checkout limpio.
2. formatter, lint, typecheck, unit tests y build terminan sin errores.
3. TypeScript strict y versiones concretas están activos.
4. CI ejecuta la misma validación.
5. ADR-001 y arquitectura reflejan únicamente lo implementado y lo planeado.

Fuera de alcance: base de datos, colas, autenticación, proveedores, despliegue y datos reales.

Resultado: completada el 2026-07-12. La siguiente vertical será E0-H2 y no incluirá todavía Prisma,
outbox ni integraciones externas.

## Segunda vertical: E0-H2

Actor: desarrollador. Entrada: Docker Engine y checkout configurado. Salida: PostgreSQL, Redis y
almacenamiento S3-compatible saludables y persistentes. Efectos: crea contenedores, red y volúmenes
locales; no usa datos ni proveedores reales.

Resultado: completada el 2026-07-12. Se probaron autenticación, protocolos y persistencia después de
recrear contenedores. Rollback no destructivo: `pnpm infra:down`.

## Tercera vertical: E0-H3

Objetivo: hacer observable la API antes de introducir lógica transaccional. Incluirá Pino con
redacción, correlation ID, filtro global de errores, métricas y readiness de dependencias. No incluirá
todavía modelos de negocio, outbox ni colas.
