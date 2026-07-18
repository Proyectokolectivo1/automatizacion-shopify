# Pruebas E9-H1A

Fecha: 2026-07-18.

- `pnpm backup:verify`: dump custom no vacío, restore aislado transaccional y equivalencia exacta de
  filas por tabla, migraciones, constraints, índices y secuencias.
- El gate elimina el dump y la base `restore_verify_*` antes de responder; solo conserva un reporte
  local ignorado, sin contenido de negocio.
- Primera medición local: 39 tablas, 30 migraciones aplicadas, backup 554 ms, restore 1.440 ms,
  verificación 445 ms y ciclo total 5.062 ms.
- El historial contiene 31 registros porque una ejecución antigua de la migración 8 fue revertida;
  Prisma confirma 30 migraciones vigentes y esquema actualizado.

La medición es evidencia de esta estación y volumen local, no un compromiso RPO/RTO ni una prueba de
almacenamiento externo. CI ejecuta el gate después de `database:verify`.
