# Prompt para la siguiente sesión

Actualizado: 2026-07-18

Continúa en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está `EN_DESARROLLO`;
no está listo para piloto ni producción. E0-H1..H5C, E1-H1A..H5A, E2-H1A..H6A,
E3-H1A..H7A y E6-H1A..H4A están completas. E6-H5A es la siguiente vertical propuesta.

Repositorio: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. Rama
`codex/foundations-e0-h2`, PR borrador #1. El avance publicado llega a E6-H2A (`770c5c5`);
E6-H3A/E6-H4A están validadas localmente y pendientes de publicación autorizada. GitHub CLI usa
keyring. No usar el PAT expuesto y no hacer commit/push sin petición explícita.

Usa siempre `token-optimizer` en modo Codex read-only. No instales hooks, compact prompt, status line
ni configuración global sin aprobación. Lee controles vivos, `PROJECT_OVERVIEW.md`, `SESSION_LOG.md`,
continuidad y documentación E6-H1A/H2A/H3A antes de editar.

## Baseline

- `pnpm validate`: 81 pruebas totales; API 20 archivos/73 pruebas y 100 % crítico, web 8/8.
- `pnpm auth:verify`: 16/16; `pnpm operations:verify`: 7/7.
- `pnpm alerts:verify`: 7/7; `pnpm database:verify`: 16/16; 30/30 migraciones y cero drift.
- Todos los gates Shopify/Wompi/WhatsApp, outbox/DLQ/identity/integración, infraestructura,
  observabilidad y `pnpm audit --prod` están verdes.
- El compose debe quedar detenido con volúmenes persistentes al cerrar.

## Garantías E6-H3A

- Next.js es BFF; los tokens solo viven en cookies HttpOnly/SameSite/Secure en producción.
- Crear/rotar/revocar sesión exige Origin exacto y, con sesión, CSRF double-submit.
- Login ofrece únicamente membresías activas después de verificar credenciales/rate limit.
- Cada lectura deriva organización de `/auth/me`; nunca confiar en tenant enviado/guardado por web.
- La proyección web elimina email, IDs de recursos/tienda, relaciones, PII y cuerpos.
- CSP permite `unsafe-eval` solo en desarrollo; producción fue comprobada sin esa fuente.

## Garantías E6-H4A

- Cinco reglas inmutables v1 reutilizan `requires_attention`; no existe SLA ni severidad inventada.
- Scheduler y evaluador usan lote/ventana acotados, locks tenant y una lectura agregada por lote.
- PostgreSQL conserva ciclos open/resolved y un índice parcial impide dos alertas abiertas por regla.
- La API pública solo ofrece reglas/listado owner/admin/operations con cursor, filtros y `no-store`.
- Alertas, auditoría y métricas no contienen PII, IDs fuente, payloads ni cardinalidad libre.
- Flags/kill switch fallan cerrados; no hay notificaciones, autocorrección, exportación o proveedor real.

## Siguiente vertical propuesta: E6-H5A

Construye búsqueda operativa global de solo lectura sobre el read model compartido. Antes de editar,
fija el contrato exacto de campos consultables, ventana máxima, límites, orden/ranking estable,
redacción y RBAC. Mantén detalle sensible y exportaciones fuera de E6-H5A salvo que el control maestro
los autorice expresamente. Reutiliza tenant, auditoría, métricas, flag/kill switch y pruebas negativas.

Conserva TD-023/024/025/026 y los bloqueos externos. No borres volúmenes ni presentes mocks como
integraciones reales.
