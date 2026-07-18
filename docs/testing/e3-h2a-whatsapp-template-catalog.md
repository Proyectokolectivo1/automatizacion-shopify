# Evidencia E3-H2A — catálogo local de plantillas

Fecha: 2026-07-14. Alcance: simulación exclusivamente local; cero tráfico Meta y cero PII real.

- `pnpm test`: 58/58 unitarias, incluido fixture v1, placeholders y decisiones de revisión.
- `pnpm whatsapp:verify`: 7/7 HTTP/PostgreSQL, con RBAC, tenant, replay, carrera, versionado,
  activación, listado, auditoría, métricas y outbox.
- `pnpm database:verify`: 13/13; 20 migraciones desde vacío, reaplicación no-op, cero drift,
  inmutabilidad, FK tenant, forma JSON y unicidad activa.
- `pnpm validate`: formatter, lint, typecheck, 58 unitarias y builds API/web en verde.
- Catorce gates funcionales previos, observabilidad e infraestructura continuaron en verde.
- `pnpm audit --prod`: bloqueado por HTTP 410 del endpoint npm retirado; no se declara exitoso.

La primera ejecución detectó una expresión regular PostgreSQL inválida por un límite de repetición
superior a 255 y una comprobación JSON que podía resultar `NULL`; ambas se corrigieron y los gates se
repitieron en verde. No se oculta este hallazgo porque forma parte de la evidencia de calidad.
