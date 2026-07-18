# Evidencia de pruebas E1-H4A

## Cobertura dedicada

- Reglas: prepago, COD, normalización, sin coincidencia, política/snapshot inválidos y contradicción.
- PostgreSQL: once migraciones, política activa única, FKs tenant e historial inmutable.
- Servicio: carrera concurrente, replay, transiciones completas, outbox único y estado no permitido.
- Pipeline: webhook → outbox → Redis → sync → outbox → clasificación, incluida recuperación Redis.
- Seguridad: fail-closed, auditoría acotada, flags, simulación y kill switch.

## Comandos

```bash
pnpm database:verify
pnpm orders:classification:verify
pnpm shopify:webhooks:verify
pnpm validate
```

Todos los datos son sintéticos y ninguna suite contacta proveedores externos.
