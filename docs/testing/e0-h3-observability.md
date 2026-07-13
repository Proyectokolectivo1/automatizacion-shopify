# Pruebas E0-H3

## Unitarias

`pnpm test` verifica configuración, redacción, generación/validación de correlation ID y liveness.
La lógica pura incluida mantiene umbral mínimo de 90%; el resultado actual es 100%.

## Integración

`pnpm test:integration` inicia NestJS contra PostgreSQL, Redis y MinIO reales y comprueba:

- `/health/live` y `/health/ready`;
- propagación de `x-correlation-id`;
- contrato seguro de errores;
- formato y métricas Prometheus.

## Fallos

`pnpm observability:verify` usa el build de producción y comprueba:

1. readiness inicial 200;
2. Redis detenido produce 503 y solo Redis queda `down`;
3. Redis reiniciado recupera readiness 200;
4. Authorization y query-string PII sintéticos no aparecen en logs/métricas;
5. los logs son JSON y contienen el correlation ID propagado.

No se prueban todavía 429/500 de proveedores, DLQ o workers porque aún no existen.
