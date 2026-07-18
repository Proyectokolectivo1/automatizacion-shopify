# Pruebas E0-H3/E0-H3B

## Unitarias

`pnpm test` verifica configuración, URLs seguras, redacción, correlation ID, acceso loopback/disabled/
bearer a métricas, liveness y propagación de contexto. Baseline E0-H3B: 20 archivos, 73 pruebas y
100 % en statements, branches, functions y lines del conjunto crítico.

## Integración

`pnpm test:integration` inicia NestJS contra PostgreSQL, Redis y MinIO reales y comprueba:

- `/health/live` y `/health/ready`;
- propagación de `x-correlation-id`;
- contrato seguro de errores;
- formato Prometheus y `Cache-Control: no-store`.

## Runtime conectado

`pnpm observability:verify` usa el build de producción y comprueba:

1. Collector, Alertmanager, receptor y API saludables;
2. continuación de un `traceparent` W3C conocido y respuesta `x-trace-id`;
3. mismo correlation ID en respuesta y logs;
4. `/metrics` sin token responde `401` y con Bearer responde `200`/`no-store`;
5. Collector recibe trace/parent IDs sin PII, Authorization ni token técnico;
6. Redis detenido produce readiness `503` y exactamente una alerta activa aunque se repita el check;
7. Redis recuperado produce exactamente una resolución;
8. Collector detenido no impide respuesta `200` de API y, al volver, recibe nuevas trazas;
9. logs y telemetría no contienen email, query sensible ni secretos sintéticos.

`pnpm infra:verify` agrega comprobaciones HTTP de salud para Collector, Alertmanager y receptor,
además de las garantías de infraestructura previas.

## Límites

Collector debug no prueba retención ni consulta productiva. Alertmanager/receptor son locales. La
persistencia del estado de transición entre reinicios queda documentada como deuda TD-025.
