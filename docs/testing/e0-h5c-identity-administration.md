# Evidencia de pruebas E0-H5C

Actualizado: 2026-07-14

Comando dedicado: `pnpm identity:verify`.

La suite crea una base PostgreSQL aleatoria, aplica las seis migraciones y la elimina al finalizar.
Valida bootstrap doble/concurrente, secreto ausente de persistencia, listado paginado, tenant, RBAC,
escalamiento admin→owner, auto-mutación, último owner, membresía extranjera, replay, conflicto de
clave, carreras y revocación inmediata de sesiones. También comprueba auditoría y métricas sin datos
sensibles ni claves crudas.

Los controles fail-closed se cubren además en la suite unitaria. No usa credenciales externas,
proveedores reales ni datos de desarrollo.
