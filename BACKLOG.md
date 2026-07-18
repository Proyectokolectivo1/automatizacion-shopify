# Backlog priorizado

Actualizado: 2026-07-18

| ID             | Prioridad       | Trabajo                                                          | Estado                     |
| -------------- | --------------- | ---------------------------------------------------------------- | -------------------------- |
| DOC-001        | P0              | Incorporar y revisar el prompt maestro suministrado              | COMPLETADA                 |
| DOC-002        | P0              | Resumen vivo de propósito, avance y trabajo pendiente            | COMPLETADA                 |
| DOC-003        | P0              | Publicar código, plan y controles en GitHub                      | COMPLETADA                 |
| SEC-001        | P0 seguridad    | Revocar PAT expuesto en conversación                             | PENDIENTE_USUARIO          |
| E0-H1          | P0              | Monorepo, estándares, CI y shells ejecutables                    | COMPLETADA                 |
| E0-H2          | P0              | Compose PostgreSQL + Redis + MinIO y health checks               | COMPLETADA                 |
| E0-H3          | P0              | Pino, correlation ID, errores, métricas y readiness              | COMPLETADA                 |
| E0-H3B         | P1              | OpenTelemetry, alertas conectadas y acceso productivo a métricas | COMPLETADA                 |
| E0-H3C         | P1 resiliencia  | Reconstrucción de alertas activas después de reinicio API        | COMPLETADA                 |
| E0-H4A         | P0              | Prisma, migración inicial, constraints e índices                 | COMPLETADA                 |
| E0-H4B         | P0              | Outbox publisher, BullMQ, reintentos y DLQ                       | COMPLETADA                 |
| E0-H4C         | P1              | Inspección y reproceso manual auditado de DLQ                    | COMPLETADA                 |
| E0-H4D         | P1 datos        | Validación de constraints legacy de ownership/outbox             | COMPLETADA                 |
| E0-H5A         | P0              | Login, sesiones revocables, rate limit y RBAC                    | COMPLETADA                 |
| E0-H5B         | P0              | Invitación y recuperación de contraseña                          | COMPLETADA                 |
| E0-H5C         | P0              | Bootstrap y administración auditada de membresías/roles          | COMPLETADA                 |
| E0-H5D         | P0 seguridad    | Revocación libera asignaciones WhatsApp de forma atómica         | COMPLETADA                 |
| E0-H6A         | P1 arquitectura | Fronteras modulares mínimas verificadas automáticamente          | COMPLETADA                 |
| E1-H1A         | P0              | Registro de integraciones y gestión de tiendas con mock Shopify  | COMPLETADA                 |
| E1-H2A         | P0              | Webhook simulado con HMAC, idempotencia, persistencia y cola     | COMPLETADA                 |
| E1-H3A         | P0              | Pedido simulado: snapshot, cliente, items y dirección            | COMPLETADA                 |
| E1-H4A         | P0              | Clasificación configurable, estados e historial                  | COMPLETADA                 |
| E1-H5A         | P0              | Conciliación simulada de faltantes, fallidos y reproceso         | COMPLETADA                 |
| E1-H1B/H2B/H3B | P0              | Adaptador live, webhook remoto, pedidos/inventario               | COMPLETADA_LOCALMENTE      |
| E1-H4B/H5B     | P0              | MARK/CANCEL y scheduler de reconciliación paginada               | COMPLETADA_LOCALMENTE      |
| E1-H5C         | P1 resiliencia  | Cursor keyset seguro para inspección de incidencias              | COMPLETADA                 |
| E1-LIVE-VERIFY | P0 credenciales | Scopes, entregas, throttle y mutaciones en tienda development    | BLOQUEADO_POR_CREDENCIALES |
| E2-H1A         | P0              | Reglas simuladas de tarifas y modalidades de pago                | COMPLETADA                 |
| E2-H2A         | P0              | Adaptador Wompi y checkout alojado en simulación                 | COMPLETADA                 |
| E2-H3A         | P0              | Webhook Wompi firmado y consulta authoritative simulados         | COMPLETADA                 |
| E2-H4A         | P0              | Programación idempotente de recordatorios simulados 0/8/16/24 h  | COMPLETADA                 |
| E2-H5A         | P0              | Vencimiento y abandono configurables en simulación               | COMPLETADA                 |
| E2-H6A         | P0              | Conciliación diaria Wompi simulada, diferencias y alertas        | COMPLETADA                 |
| E2-H2B/H3B..H6 | P0              | Sandbox y ciclo Wompi real                                       | BLOQUEADO_POR_CREDENCIALES |
| E3-H1A         | P0              | Configuración y proveedor WhatsApp exclusivamente simulados      | COMPLETADA                 |
| E3-H2A         | P0              | Catálogo y estados de plantillas exclusivamente simulados        | COMPLETADA                 |
| E3-H3A         | P0              | Envío transaccional WhatsApp exclusivamente simulado             | COMPLETADA                 |
| E3-H4A         | P0              | Estados y webhook WhatsApp exclusivamente simulados              | COMPLETADA                 |
| E3-H5A         | P0              | Mensajes entrantes WhatsApp exclusivamente simulados             | COMPLETADA                 |
| E3-H6A         | P0              | Bandeja de conversaciones WhatsApp simulada                      | COMPLETADA                 |
| E3-H7A         | P0              | Asignación de conversaciones a agentes simulada                  | COMPLETADA                 |
| E3-H8A         | P0 seguridad    | Purga auditable de contenido inbound vencido                     | COMPLETADA                 |
| E3-H1B/H2B..H7 | P0              | WhatsApp Cloud API real, plantillas, mensajes y bandeja          | BLOQUEADO_POR_CREDENCIALES |
| E4-H1..H10     | P0              | Adaptador, mock, contrato y flujo Mastershop                     | BLOQUEADO_POR_PROVEEDOR    |
| E5-H1..H8      | P1              | Agente e impresión Windows                                       | BLOQUEADO_POR_INVENTARIO   |
| E6-H1A         | P1              | Cola operativa unificada de solo lectura                         | COMPLETADA                 |
| E6-H2A         | P1              | Resumen operativo agregado de solo lectura                       | COMPLETADA                 |
| E6-H3A         | P1 seguridad    | Base segura del dashboard web de solo lectura                    | COMPLETADA                 |
| E6-H4A         | P1              | Alertas operativas internas, durables y deduplicadas             | COMPLETADA                 |
| E6-H5A         | P1              | Búsqueda operativa global de solo lectura                        | COMPLETADA                 |
| E6-H6A         | P1 seguridad    | Detalle operativo mínimo de solo lectura                         | COMPLETADA                 |
| E6-H7A         | P1 seguridad    | Export operativo acotado y redactado                             | COMPLETADA                 |
| E7-H1A         | P1              | Cartera Wompi simulada agregada, exacta y tenant-safe            | COMPLETADA                 |
| E7-H2..H5      | P1              | Costos, recaudo y rentabilidad histórica                         | BLOQUEADO_POR_DECISION     |
| E8-H1..H6      | P2              | Ads y atribución                                                 | BLOQUEADO_POR_CREDENCIALES |
| E9-H1A         | P0 lanzamiento  | Backup/restore PostgreSQL local aislado y medido                 | COMPLETADA                 |
| E9-H2A         | P0 lanzamiento  | Carga local de 500 pedidos, backlog, drain y replay              | COMPLETADA                 |
| E9-H3A         | P0 lanzamiento  | Baseline local de secretos, dependencias, CI, Compose y headers  | COMPLETADA                 |
| E9-H4A         | P0 lanzamiento  | Smoke productivo local y rollback forward-compatible             | COMPLETADA                 |
| E9-H5A         | P0 lanzamiento  | Drill local medido de observabilidad y recuperación              | COMPLETADA                 |
| E9-H6..H8      | P0 lanzamiento  | Monitoreo productivo, piloto y release                           | BLOQUEADO_POR_DECISION     |
