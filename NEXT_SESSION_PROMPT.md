# Prompt para la siguiente sesión

Actualizado: 2026-07-17

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C, E1-H1A a E1-H5A,
E2-H1A a E2-H6A y E3-H1A a E3-H6A están completas; E0-H3B permanece pendiente.

Repositorio: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. Rama
`codex/foundations-e0-h2`, PR borrador #1. GitHub CLI está autenticado por keyring. No uses el PAT
expuesto y confirma su revocación antes de aceptar credenciales nuevas.

Lee por completo las dos fuentes maestras, los archivos de control, `PROJECT_OVERVIEW.md`,
`SESSION_LOG.md`, `docs/architecture/project-continuity.md` y la documentación E3-H5A/E3-H6A antes
de editar. Actualiza todos los controles y el log append-only al cambiar estado.

## Baseline

Ejecuta instalación congelada, `pnpm validate`, integración, database/outbox/DLQ/auth/identity,
todos los gates Shopify/Wompi/WhatsApp, status de migraciones, observabilidad, infraestructura y
`pnpm audit --prod`. No borres volúmenes. El último audit respondió normalmente y reportó cero
vulnerabilidades conocidas.

## Siguiente vertical exacta: E3-H7A

Implementa asignación de conversaciones únicamente en simulación:

- agente asignable debe ser una membresía ACTIVE del mismo tenant con rol SUPPORT, OPERATIONS, ADMIN
  u OWNER; no aceptar IDs de usuario sin membresía elegible;
- claim, reassign y unassign explícitos con RBAC diferenciado y conflicto de versión/lock;
- persistir asignación actual y un historial inmutable tenant-safe con actor, agente anterior/nuevo,
  razón acotada y timestamp;
- carrera concurrente determinista, idempotencia, lookup no revelador y último estado visible en la
  bandeja sin exponer emails/teléfonos;
- auditoría/outbox/métricas acotados sin contenido de mensajes ni PII;
- probar agente ajeno/inactivo/no elegible, replay, colisión, carrera, tenant, RBAC y kill switch;
- no responder mensajes, conectar Meta ni construir UI final.

Conserva E3-H5A/H6A: contenido expirado no se descifra y listado no carga cuerpos. TD-023 sigue
abierta y bloquea tráfico real junto con credenciales/contrato Meta.

Baseline al cierre: `pnpm validate` con 20 archivos/69 pruebas y 100 % crítico,
`pnpm whatsapp:verify` 21/21, `pnpm database:verify` 14/14 y 26 migraciones; regresiones,
observabilidad e infraestructura verdes. E3-H6A no agregó migraciones.
