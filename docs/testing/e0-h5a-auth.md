# Evidencia de pruebas E0-H5A

Actualizado: 2026-07-12

`pnpm auth:verify` crea una base PostgreSQL temporal, aplica todas las migraciones vigentes y levanta la API.
Verifica seis escenarios:

- Argon2id y persistencia exclusiva de hashes de tokens;
- login y endpoint autenticado;
- rol owner permitido y read-only denegado;
- organización ajena denegada y auditada;
- rotación refresh, access anterior inválido y replay que revoca;
- expiración, logout inmediato, respuestas uniformes, rate limit y bloqueo temporal;
- auditoría y métricas sin credenciales ni tokens.

Las unitarias cubren hash/verify, tokens opacos, matriz RBAC y controles del adaptador de correo.
