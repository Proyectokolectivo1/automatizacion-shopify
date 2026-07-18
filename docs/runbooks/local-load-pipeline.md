# Runbook de carga local E9-H2A

## Ejecución

1. Prepare `.env` con `pnpm infra:bootstrap` y levante dependencias con `pnpm infra:up`.
2. Evite otras suites o procesos intensivos sobre PostgreSQL/Redis durante la medición.
3. Ejecute:

```powershell
pnpm load:verify
```

El gate exige 500 respuestas `202`, ingreso mínimo 5 req/s, p95 máximo 2.500 ms, backlog inicial 500,
drain mínimo 2 pedidos/s y máximo 120 s, 500 pedidos finales, 1.500 transiciones, 50 replays y cero
errores/DLQ. El reporte queda en `.artifacts/load/e9-h2a-*.json` sin IDs ni datos de negocio.

Ante un fallo, la suite imprime únicamente conteos por estado y hasta cinco razones técnicas de jobs.
Siempre intenta obliterar sus dos colas y eliminar su base `ecommerce_load_*`. Compruebe residuos:

```powershell
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT datname FROM pg_database WHERE datname LIKE ''ecommerce_load_%''"'
```

No elimine bases o colas que no tengan exactamente el prefijo aleatorio de esta suite. Cierre Compose
sin borrar volúmenes mediante `pnpm infra:down`.

Un resultado verde no autoriza capacidad productiva. Repita en la infraestructura candidata con
tráfico/proveedores sandbox, observabilidad y criterios aprobados antes del piloto.
