# Backup y restore PostgreSQL local E9-H1A

`pnpm backup:verify` usa `pg_dump` y `pg_restore` de la misma imagen PostgreSQL 17 fijada en
Compose. El dump custom sale por `stdout` hacia un archivo temporal local y vuelve por `stdin` a una
base aislada `restore_verify_<aleatorio>`. Nunca se ejecuta restore sobre la base fuente.

La prueba construye un manifiesto antes del dump y otro después del restore. La equivalencia exige:

- conteo exacto de filas de cada tabla pública;
- historial y estado de migraciones Prisma;
- definiciones de constraints e índices;
- nombres y valores de secuencias.

El archivo se crea con modo `0600` dentro de `.artifacts/postgres-backup`, excluido de Git, y se
elimina en `finally`. La base temporal también se elimina con `dropdb --force`; el gate comprueba su
ausencia antes de emitir éxito. Solo permanece un JSON sin filas, credenciales ni manifiesto, con
conteos técnicos, tamaño y duraciones.

Esto demuestra recuperabilidad en la estación local y detecta dumps corruptos o incompletos. No
implementa cifrado de backups, almacenamiento offsite, retención, automatización productiva, failover
ni objetivos contractuales RPO/RTO.
