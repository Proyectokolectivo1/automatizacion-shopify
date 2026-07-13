# Pruebas E0-H2

## Automatizadas

```bash
pnpm infra:bootstrap
pnpm infra:verify
pnpm validate
pnpm audit --prod
```

`infra:verify` cubre:

1. sintaxis y variables Compose;
2. health checks;
3. conexión PostgreSQL mediante `pg_isready` y `SELECT 1`;
4. conexión Redis autenticada mediante `PING`;
5. endpoint de salud MinIO, creación idempotente del bucket y operaciones S3 mediante `mc`;
6. persistencia de PostgreSQL, Redis y un objeto MinIO después de `docker compose down` y recreación;
7. limpieza de marcadores.

No cubre migraciones ni recuperación de backup; todavía no existen en esta vertical.
