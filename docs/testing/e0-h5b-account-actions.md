# Evidencia de pruebas E0-H5B

Actualizado: 2026-07-13

`pnpm auth:verify` ejecuta catorce escenarios HTTP/PostgreSQL. Además de los seis de sesiones/RBAC, verifica:

- invitación owner a rol inferior, hash exclusivo y consumo único;
- prohibición de owner→owner, admin→admin/owner, lector y tenant ajeno;
- creación de usuario y vinculación de cuenta existente sin sustituir password;
- invitación vencida y replay concurrente con exactamente un éxito;
- feature flag/kill switch cerrados y recuperación externa uniforme;
- recuperación conocida/desconocida con el mismo 202 y token vencido rechazado;
- rotación Argon2id, revocación inmediata de sesiones y replay rechazado;
- auditoría y métricas sin PII ni secretos.

`pnpm database:verify` ejecuta cinco escenarios y valida la quinta migración, shape por propósito, formato SHA-256 y exclusión mutua de consumido/revocado. Las unitarias cubren fixtures de ambos correos y `blocked`/`simulated`/fail-closed.

No se contacta ningún proveedor externo. Las bases y fixtures son efímeros.
