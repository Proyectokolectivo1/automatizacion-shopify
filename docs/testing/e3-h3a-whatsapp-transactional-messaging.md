# Evidencia E3-H3A — mensajería transaccional simulada

Fecha: 2026-07-14. Alcance: aceptación determinista local, sin tráfico Meta ni estados reales.

- `pnpm test`: 63/63 unitarias; incluye render tipado, fechas, moneda, URL HTTPS, fixture, determinismo,
  ausencia de token en el resultado y controles fail-closed.
- `pnpm whatsapp:verify`: 10/10 HTTP/PostgreSQL; incluye RBAC, tenant, plantilla ausente, variables,
  carrera, replay HTTP, deduplicación de negocio, conversación, auditoría, métrica y outbox sin PII.
- `pnpm database:verify`: 14/14; incluye 21 migraciones, constraints, inmutabilidad, teléfono E.164,
  estado exclusivamente simulado, unicidad y cero drift.
- `pnpm validate`: formatter, lint, typecheck, 63 unitarias y builds API/web en verde.
- La regresión funcional completa, observabilidad e infraestructura continuaron en verde; la migración
  21 quedó aplicada a la base local persistente y el esquema está al día.
- `pnpm audit --prod`: bloqueado por HTTP 410 del endpoint npm retirado; no se declara exitoso.

La primera verificación de base detectó un parámetro SQL sin tipo en el test de duplicado. El fixture se
corrigió para usar únicamente placeholders referenciados y las 14 pruebas se repitieron en verde.
