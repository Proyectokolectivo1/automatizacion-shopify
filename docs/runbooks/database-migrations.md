# Runbook de migraciones

## Precondiciones

1. Ejecute `pnpm infra:bootstrap` y `pnpm infra:up`.
2. Confirme `pnpm database:status` y revise el SQL pendiente.
3. Con datos reales, disponga de backup y rollback aprobado antes de aplicar.

## Aplicación local

```bash
pnpm database:migrate
pnpm database:status
pnpm database:verify
```

`database:verify` crea una base temporal aleatoria, aplica dos veces, comprueba ausencia de drift,
instancia Prisma, fuerza violaciones de constraints y elimina la base en `afterAll`.

## Rollback

Esta migración inicial no tiene `down` automático. En producción se prefiere corregir hacia adelante:
detener el release, conservar las tablas nuevas sin consumidores y desplegar una migración
correctiva. Como no reemplaza ni elimina estructuras previas, dejarla aplicada es seguro mientras no
haya escritores.

Solo en un entorno local desechable y tras confirmar que no contiene datos, el rollback manual
elimina, en orden, `outbox_events`, `idempotency_keys`, `stores`, `organizations`, sus tres enums y el
registro correspondiente de `_prisma_migrations`. No automatizar ni ejecutar sobre datos reales.

## Fallos

- Conexión rechazada: verificar `pnpm infra:verify` y `POSTGRES_*`.
- Migración fallida: no editar una migración aplicada; usar `prisma migrate resolve` solo después de
  determinar el estado real de la operación.
- Drift: detener el despliegue y comparar con `prisma migrate diff`; no usar `db push` para ocultarlo.
