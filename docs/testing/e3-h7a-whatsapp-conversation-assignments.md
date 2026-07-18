# Pruebas E3-H7A — asignación WhatsApp simulada

Actualizado: 2026-07-17

## Cobertura dedicada

- Claim propio, replay y colisión de idempotencia.
- Carrera de claims: un único ganador y conflicto determinista para el perdedor.
- Reassign/unassign solo para managers, con historial, outbox y replay.
- Membresía ajena, inactiva o no elegible; tenant no revelador y kill switch independiente.
- Proyección de bandeja con membership ID, versión y timestamp, sin email/teléfono/contenido.
- Constraints de razón/acción, FKs tenant-safe e historial inmutable en PostgreSQL real.

## Evidencia al implementar

- `pnpm whatsapp:verify`: 25/25.
- `pnpm database:verify`: 15/15, 27 migraciones y cero drift.
- `pnpm validate`: 20 archivos, 69 pruebas unitarias, cobertura crítica al 100 %, lint, tipos y
  builds verdes.

La primera verificación de base reveló una condición SQL que aceptaba `NULL` y una diferencia en el
nombre de una FK. Ambas se corrigieron antes del cierre y la migración se verificó desde vacío.
