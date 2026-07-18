# Prompt para la siguiente sesión

Actualizado: 2026-07-17

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C, E0-H3B,
E1-H1A a E1-H5A, E2-H1A a E2-H6A, E3-H1A a E3-H7A y E6-H1A están completas. E6-H2A es la siguiente
vertical.

Repositorio: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. Rama
`codex/foundations-e0-h2`, PR borrador #1. Los cambios E3-H7A/E0-H3B/E6-H1A pueden estar aún locales:
revisa el árbol antes de publicar y no hagas commit/push sin autorización explícita. GitHub CLI usa
el keyring. No uses el PAT expuesto y confirma su revocación antes de aceptar credenciales nuevas.

Usa siempre la skill `token-optimizer` al retomar: ejecuta su diagnóstico read-only para Codex y
aplica su disciplina de contexto. No modifiques hooks, status line ni configuración global sin
aprobación explícita del usuario.

Lee por completo las fuentes maestras, controles vivos, `PROJECT_OVERVIEW.md`, `SESSION_LOG.md`,
`docs/architecture/project-continuity.md` y la documentación E6-H1A antes de editar. Actualiza todos
los controles y el log append-only cuando cambie el estado.

## Baseline

Ejecuta instalación congelada, `pnpm validate`, integración, database/outbox/DLQ/auth/identity,
todos los gates Shopify/Wompi/WhatsApp/operations, status de migraciones, observabilidad,
infraestructura y `pnpm audit --prod`. No paralelices suites que ejecutan `prisma generate` y no
borres volúmenes.

Baseline al cierre de E6-H1A: `pnpm validate` con 20 archivos/73 pruebas y 100 % crítico,
`pnpm operations:verify` 5/5, `pnpm whatsapp:verify` 25/25, `pnpm database:verify` 15/15 y 28/28
migraciones. Todos los gates funcionales, observabilidad, infraestructura y auditoría están verdes.
El compose local se deja detenido con volúmenes persistentes.

## Siguiente vertical exacta: E6-H2A

Construye un resumen operativo agregado de solo lectura sobre la política v1 de E6-H1A:

- reutilizar una única definición de tipos y `requiresAttention`; no copiar una segunda semántica
  que pueda divergir de la cola;
- exigir organización en ruta, sesión, permiso RBAC específico o compartido justificadamente y
  coincidencia tenant dentro de cada agregado;
- aceptar una ventana temporal ISO-8601 acotada y filtros enumerados útiles; rechazar campos
  desconocidos y rangos inválidos;
- devolver contrato versionado con conteos totales y desgloses deterministas por tipo/estado/atención,
  sin promedios, SLA, prioridad o severidad no respaldados por datos durables;
- limitar cardinalidad y rango para evitar scans costosos; añadir índices/evidencia SQL solo si son
  necesarios y probar que no existe N+1;
- omitir PII, texto, payloads, secretos e IDs externos; usar `no-store`, auditoría y métricas acotadas;
- conservar flag/kill switch fail-closed y probar RBAC, tenant, ventana, filtros, cero resultados,
  redacción, regresión y consistencia con los mismos fixtures de la cola;
- documentar arquitectura, contrato, seguridad, pruebas y runbook antes de marcarla completa;
- no crear todavía dashboard visual, exports, alertas automáticas, mutaciones, auto-corrección ni
  conexiones reales a Shopify/Wompi/Meta/Mastershop.

Conserva las garantías previas: Collector/alertas no tumban API; métricas productivas exigen Bearer;
contenido WhatsApp vencido no se descifra; la cola no carga cuerpos; asignación usa membresías
tenant-safe. TD-023, TD-024, TD-025, TD-026 y R-067 siguen abiertas. Proveedores reales permanecen
bloqueados.
