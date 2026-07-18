# Runbook de backup y restore PostgreSQL local E9-H1A

## Prerrequisitos

1. Ejecute `pnpm install --frozen-lockfile` y `pnpm infra:bootstrap` si no existe `.env`.
2. Aplique el esquema con `pnpm database:migrate` o valide primero con `pnpm database:verify`.
3. Detenga procesos que escriban en la base durante la comprobación. El script inicia PostgreSQL,
   pero no detiene API ni workers y deja Compose activo al terminar.

## Verificación

```powershell
pnpm backup:verify
```

El comando debe informar `OK`, migraciones aplicadas y tiempos de backup, restore, verificación y
total. El reporte local queda en `.artifacts/postgres-backup/*.json`; no contiene datos de negocio.

Compruebe el cleanup si el proceso fue interrumpido:

```powershell
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT datname FROM pg_database WHERE datname LIKE ''restore_verify_%''"'
Get-ChildItem .artifacts/postgres-backup -Filter *.dump
```

Si existe una base temporal, confirme que su nombre comienza exactamente por `restore_verify_` antes
de eliminarla. Nunca apunte `pg_restore` a la base fuente ni conserve/copíe el dump temporal.

Para cerrar el entorno sin perder volúmenes:

```powershell
pnpm infra:down
```

Esta operación no sustituye un runbook productivo. Antes del piloto todavía deben definirse destino
offsite cifrado, acceso, retención, frecuencia, monitoreo y RPO/RTO aprobados.
