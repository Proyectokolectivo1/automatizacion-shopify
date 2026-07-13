# Runbook: observabilidad de la API

## Verificación completa

```bash
pnpm infra:up
pnpm build
pnpm test:integration
pnpm observability:verify
```

La última prueba detiene Redis, exige readiness `503`, reinicia Redis y exige recuperación `200`.
Siempre deja Redis iniciado en su bloque de limpieza.

## Endpoints locales

```text
GET http://127.0.0.1:3001/health/live
GET http://127.0.0.1:3001/health/ready
GET http://127.0.0.1:3001/metrics
```

## Diagnóstico de readiness

1. Consulte `/health/ready` y ubique la dependencia `down`.
2. Use `docker compose ps` y los logs del servicio afectado.
3. Ejecute `pnpm infra:verify` para probar protocolo y persistencia.
4. No cambie datos ni elimine volúmenes para resolver un health check.

## Interpretación

- Liveness 200 + readiness 503: el proceso funciona, pero no debe recibir tráfico de negocio.
- Liveness sin respuesta: reinicie el proceso API y revise `api_started`/errores de bootstrap.
- `ecommerce_api_dependency_ready=0`: investigue la dependencia indicada.
- Aumento de `ecommerce_api_http_request_duration_seconds`: revise por ruta y estado.

## Seguridad

Los endpoints se ligan a localhost por defecto. Antes de producción, `/metrics` debe restringirse en
el reverse proxy. Nunca publique logs completos en tickets sin revisar redacción y PII.
