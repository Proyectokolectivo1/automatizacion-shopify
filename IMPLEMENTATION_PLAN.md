# Plan de implementación

Actualizado: 2026-07-13

| Fase | Vertical demostrable               | Estado                     | Criterio de salida                                        |
| ---- | ---------------------------------- | -------------------------- | --------------------------------------------------------- |
| 0    | Descubrimiento técnico y contratos | PARCIAL                    | inventario de accesos, proveedores e impresoras           |
| 1A   | E0-H1 monorepo, estándares y CI    | COMPLETADA                 | install, quality gate, audit y smoke verdes               |
| 1B   | E0-H2 entorno local                | COMPLETADA                 | protocolos, auth, salud y persistencia probados           |
| 1C   | E0-H3 observabilidad base          | COMPLETADA                 | logs, correlación, errores, métricas y readiness probados |
| 1D   | E0-H4A esquema y migración inicial | COMPLETADA                 | migración limpia/repetible y constraints probados         |
| 1E   | E0-H4B outbox y colas              | COMPLETADA                 | transacción, publicación, reintentos y DLQ probados       |
| 1F   | E0-H5A login, sesiones y RBAC      | COMPLETADA                 | sesión segura y permisos backend probados                 |
| 1G   | E0-H5B invitación y recuperación   | COMPLETADA                 | tokens de un uso y correo simulado probados               |
| 1H   | E0-H4C operaciones de DLQ          | SIGUIENTE                  | inspección/reproceso autenticados y auditados             |
| 2    | Shopify mínimo                     | BLOQUEADO_POR_CREDENCIALES | webhook idempotente, pedido, timeline y conciliación      |
| 3    | COD + Wompi + WhatsApp             | BLOQUEADO_POR_CREDENCIALES | link, mensaje, confirmación y vencimiento simulables      |
| 4    | Mastershop                         | BLOQUEADO_POR_PROVEEDOR    | mock contractual y flujo real solo con contrato           |
| 5    | Impresión                          | BLOQUEADO_POR_INVENTARIO   | agente, PDF, spool y reimpresión auditada                 |
| 6    | Operación y dashboard              | PENDIENTE                  | filtros, alertas, métricas y exportación                  |
| 7    | Rentabilidad y publicidad          | BLOQUEADO_POR_DECISION     | snapshots, atribución con confianza y ROAS                |
| 8    | Hardening y lanzamiento            | PENDIENTE                  | carga, seguridad, restore, piloto y aprobación humana     |

## Verticales completadas

- E0-H1: checkout reproducible, estándares, CI, pruebas y builds.
- E0-H2: PostgreSQL, Redis y S3-compatible locales, autenticados y persistentes.
- E0-H3: logs Pino redactados, correlation ID, errores seguros, Prometheus y readiness real. La
  prueba runtime degrada ante caída de Redis, conserva sanas las demás dependencias y recupera.

## Cuarta vertical: E0-H4A

Actor: desarrollador. Entrada: PostgreSQL saludable y configuración validada. Salida: esquema mínimo
versionado y verificable desde una base vacía. Efectos: crea exclusivamente estructuras locales.

Criterios de aceptación:

1. Prisma y sus versiones quedan fijados en lockfile.
2. La primera migración expand-only crea organizaciones, tiendas, claves idempotentes y outbox.
3. Claves foráneas, unicidad, estados, timestamps e índices reflejan invariantes explícitas.
4. La migración funciona desde una base vacía y su reaplicación es segura/no-op.
5. Pruebas de integración usan PostgreSQL real y verifican constraints críticos.
6. Rollback operativo y límites de la migración quedan documentados.

Fuera de alcance: publicador outbox, BullMQ, pedidos, autenticación e integraciones reales.

Resultado: completada el 2026-07-12. La migración fue aplicada en una base temporal vacía y en la
base local, reaplicada como no-op, comparada sin drift y ejercitada mediante Prisma y PostgreSQL real.

## Quinta vertical: E0-H4B

Implementar el límite transaccional y la entrega asíncrona: Prisma lifecycle en NestJS, persistencia
de agregado + outbox en una transacción, claim concurrente seguro, BullMQ, reintentos acotados, DLQ,
idempotencia y pruebas de caída/recuperación. No incluir pedidos ni proveedores reales.

Resultado: completada el 2026-07-12. La suite aislada confirma atomicidad, replay, rollback,
concurrencia, Redis inaccesible/recuperado, reintentos y DLQ sobre servicios reales.

## Sexta vertical: E0-H5A

Implementar identidad local mínima, membresías organizacionales, almacenamiento robusto de
contraseñas, sesiones revocables y autorización RBAC en backend. El correo permanecerá detrás de un
adaptador con simulación, flag y kill switch mientras no exista proveedor decidido.

Resultado: completada el 2026-07-12. Login uniforme, Argon2id, access/refresh opacos, rotación,
revocación, rate limit, auditoría, RBAC y aislamiento de tenant se probaron sobre PostgreSQL real.

## Séptima vertical: E0-H5B

Completar invitaciones y recuperación con tokens de un solo uso, hash persistido, expiración,
revocación y replay seguro. Usar el adaptador de correo únicamente en simulación mientras DP-001 siga pendiente.

Resultado: completada el 2026-07-13. Cinco migraciones y pruebas HTTP/PostgreSQL confirman emisión
CSPRNG, consumo único/concurrente, expiración, jerarquía de roles, tenant, respuesta uniforme,
revocación de sesiones y correo simulado fail-closed.

## Octava vertical: E0-H4C

Agregar ownership organizacional explícito a eventos/jobs y una superficie operativa protegida para
consultar DLQ y reprocesar exactamente un evento de forma idempotente, auditada y desactivable. Debe
probar tenant isolation, paginación, carreras y respuesta perdida sobre PostgreSQL/Redis reales.
