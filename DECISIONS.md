# Decisiones y supuestos

Actualizado: 2026-07-14

| ID     | Tipo               | Decisión o supuesto                                                                          | Estado             |
| ------ | ------------------ | -------------------------------------------------------------------------------------------- | ------------------ |
| D-001  | DECISIÓN           | Monolito modular con workers separados por proceso                                           | ACEPTADA; ADR-001  |
| D-002  | DECISIÓN           | Node 22.23.1, pnpm 10.25.0, NestJS 11.1.28, Next.js 15.5.20 y React 19.2.7                   | ACEPTADA           |
| D-003  | DECISIÓN           | Forzar PostCSS 8.5.10 por GHSA-qx2v-qp2m-jg93                                                | ACEPTADA temporal  |
| D-004  | DECISIÓN           | PostgreSQL 17.10, Redis 7.4.9 y MinIO 2025-09-07 para desarrollo local                       | ACEPTADA           |
| D-005  | DECISIÓN           | MinIO comunitario solo en localhost y prohibido para producción                              | ACEPTADA temporal  |
| D-006  | DECISIÓN           | Puertos host 5433, 6380, 9100 y 9101                                                         | ACEPTADA local     |
| D-007  | DECISIÓN           | Pino 10.3.1, prom-client 15.1.3, pg 8.22.0, redis 6.1.0 y Zod 4.4.3 fijados                  | ACEPTADA E0-H3     |
| D-008  | DECISIÓN           | Un registro Prometheus privado por app y etiquetas de ruta acotadas, nunca URL cruda         | ACEPTADA E0-H3     |
| D-009  | DECISIÓN           | OpenTelemetry se entrega en E0-H3B; no se simulan trazas sin collector/exporter verificable  | ACEPTADA           |
| D-010  | DECISIÓN           | Prisma, cliente y adapter-pg 7.8.0 con generador CJS y versiones exactas                     | ACEPTADA E0-H4A    |
| D-011  | DECISIÓN           | SQL versionado es la fuente de estructura; prohibido `db push` en entornos compartidos       | ACEPTADA E0-H4A    |
| D-012  | DECISIÓN           | Migraciones expand-only y rollback por corrección hacia adelante                             | ACEPTADA E0-H4A    |
| D-013  | DECISIÓN           | Forzar `@hono/node-server` 1.19.13 por GHSA-92pp-h63x-v22m                                   | ACEPTADA temporal  |
| D-014  | DECISIÓN           | PostgreSQL reclama outbox con lease y `FOR UPDATE SKIP LOCKED`; BullMQ no decide ownership   | ACEPTADA E0-H4B    |
| D-015  | DECISIÓN           | `jobId` combina UUID outbox y versión de entrega; consumidor idempotente obligatorio         | ACTUALIZADA E0-H4C |
| D-016  | DECISIÓN           | Publisher/worker desactivados, kill switch activo y simulación activa por defecto            | ACEPTADA E0-H4B    |
| D-017  | DECISIÓN           | Sesiones opacas server-side; PostgreSQL guarda solo hashes y permite revocación inmediata    | ACEPTADA E0-H5A    |
| D-018  | DECISIÓN           | Argon2id v1 con 19 MiB, 2 iteraciones, p=1 y parámetros versionados                          | ACEPTADA E0-H5A    |
| D-019  | DECISIÓN           | RBAC default-deny y coincidencia de organización obligatoria en backend                      | ACEPTADA E0-H5A    |
| D-020  | DECISIÓN           | Correo desactivado, kill switch activo y simulación por defecto hasta resolver DP-001        | ACEPTADA temporal  |
| D-021  | DECISIÓN           | Invitación/reset usan CSPRNG, solo hash, propósito y consumo bloqueado por fila              | ACEPTADA E0-H5B    |
| D-022  | DECISIÓN           | Owner no invita owner; admin no asigna owner/admin; invitación no cambia rol activo          | ACEPTADA E0-H5B    |
| D-023  | DECISIÓN           | Acciones de cuenta tienen flag/kill switch propios cerrados por defecto                      | ACEPTADA E0-H5B    |
| D-024  | DECISIÓN           | Operaciones DLQ exigen ownership organizacional y permiso exclusivo owner/admin              | ACEPTADA E0-H4C    |
| D-025  | DECISIÓN           | Reproceso usa lock/idempotencia serializable y `NOW()` de PostgreSQL para evitar clock skew  | ACEPTADA E0-H4C    |
| D-026  | DECISIÓN           | API DLQ nunca expone payload; solo resumen y categoría de error acotada                      | ACEPTADA E0-H4C    |
| D-027  | DECISIÓN           | Bootstrap owner es local, sin argumentos, solo entorno y lock global serializable            | ACEPTADA E0-H5C    |
| D-028  | DECISIÓN           | Administración de identidad tiene flag/kill switch independientes y permiso exclusivo        | ACEPTADA E0-H5C    |
| D-029  | DECISIÓN           | Auto-mutación prohibida; admin no gestiona owner/admin; último owner protegido               | ACEPTADA E0-H5C    |
| D-030  | DECISIÓN           | Cambio de rol o revocación invalida sesiones y snapshot idempotente en una transacción       | ACEPTADA E0-H5C    |
| D-031  | DECISIÓN           | Repositorio canónico `Proyectokolectivo1/automatizacion-shopify`, rama remota `main`         | ACEPTADA           |
| D-032  | DECISIÓN           | Credenciales Shopify usan AES-256-GCM, AAD tenant+tienda y keyring versionado fuera de DB    | ACEPTADA E1-H1A    |
| D-033  | DECISIÓN           | Solo mock Shopify v1 está vinculado; modo no simulado falla cerrado hasta adaptador real     | ACEPTADA E1-H1A    |
| D-034  | DECISIÓN           | HMAC Shopify se valida sobre bytes crudos antes de parsear y con comparación constante       | ACEPTADA; ADR-002  |
| D-035  | DECISIÓN           | Evento webhook y outbox se persisten juntos; Redis nunca condiciona la respuesta HTTP        | ACEPTADA E1-H2A    |
| D-036  | DECISIÓN           | No se rechaza por antigüedad un webhook firmado; se conserva timestamp para ordenar/tardíos  | ACEPTADA E1-H2A    |
| D-037  | DECISIÓN           | Webhook solo dispara consulta; el adaptador entrega un recurso validado por normalizador Zod | ACEPTADA E1-H3A    |
| D-038  | DECISIÓN           | Montos de pedido se persisten como BIGINT en unidades menores, nunca como flotantes          | ACEPTADA E1-H3A    |
| D-039  | DECISIÓN           | `source_updated_at` gobierna updates; snapshots iguales/tardíos no producen efectos          | ACEPTADA E1-H3A    |
| D-040  | DECISIÓN           | Clasificación usa políticas JSON v1 versionadas por tienda y prioridad explícita             | ACEPTADA E1-H4A    |
| D-041  | DECISIÓN           | Ausencia, invalidez o contradicción de reglas falla cerrado y deriva a retry/DLQ             | ACEPTADA E1-H4A    |
| D-042  | DECISIÓN           | Todo cambio de estado genera historial SQL inmutable y evento outbox en la misma transacción | ACEPTADA E1-H4A    |
| D-043  | DECISIÓN           | Checkpoint e incidencias de conciliación son durables y deduplicadas por fingerprint         | ACEPTADA E1-H5A    |
| D-044  | DECISIÓN           | Recuperación interna se marca explícita y sin fingir firma HMAC del proveedor                | ACEPTADA E1-H5A    |
| D-045  | DECISIÓN           | Reproceso individual reutiliza outbox bajo lock, idempotencia, RBAC y auditoría              | ACEPTADA E1-H5A    |
| S-001  | SUPUESTO RESUELTO  | Especificación y prompt adjunto son las fuentes operativas obligatorias                      | CONFIRMADO         |
| S-002  | SUPUESTO           | Se conserva la rama base existente; no se renombra sin autorización                          | ACTIVO             |
| DP-001 | DECISIÓN PENDIENTE | Dominio y proveedor de correo                                                                | PENDIENTE          |
| DP-002 | DECISIÓN PENDIENTE | Cancelar o marcar pedidos COD vencidos                                                       | PENDIENTE          |
| DP-003 | DECISIÓN PENDIENTE | Política legal de retención y no reembolso                                                   | PENDIENTE          |
| DP-004 | DECISIÓN PENDIENTE | Fórmula de costo de producto y atribución publicitaria                                       | PENDIENTE          |
| DP-005 | DECISIÓN PENDIENTE | RPO/RTO aceptados contractualmente                                                           | PENDIENTE          |

Las versiones se fijan sin rangos. Cambios mayores requieren verificación y ADR cuando alteren la
arquitectura.
