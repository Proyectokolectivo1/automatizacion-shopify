# Runbook: observabilidad de la API

## Verificación completa

```bash
pnpm test:integration
pnpm observability:verify
pnpm infra:verify
```

La prueba runtime valida propagación W3C, correlación de logs/spans, autenticación de métricas,
alerta única al detener Redis, resolución al recuperarlo y continuidad de API al detener Collector.
El comando ya construye la API, inicia Compose, mide detección/recuperación y restaura los servicios
detenidos en bloques de limpieza.

## Endpoints locales

```text
GET http://127.0.0.1:3001/health/live
GET http://127.0.0.1:3001/health/ready
GET http://127.0.0.1:3001/metrics
GET http://127.0.0.1:13133/        # salud Collector
GET http://127.0.0.1:9093/-/healthy
GET http://127.0.0.1:18080/health
GET http://127.0.0.1:18080/events  # solo estado/timestamp local
```

Con `METRICS_ACCESS_MODE=bearer`, use `Authorization: Bearer <METRICS_BEARER_TOKEN>`.

## Controles

```text
OTEL_TRACING_ENABLED=false
OTEL_TRACING_KILL_SWITCH=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces
OTEL_EXPORTER_TIMEOUT_MS=1000
OTEL_TRACES_SAMPLE_RATIO=1
OBSERVABILITY_ALERTS_ENABLED=false
OBSERVABILITY_ALERTS_KILL_SWITCH=true
ALERTMANAGER_URL=http://127.0.0.1:9093/api/v2/alerts
ALERTMANAGER_TIMEOUT_MS=1000
METRICS_ACCESS_MODE=loopback
METRICS_BEARER_TOKEN=
```

Flags y kill switches deben habilitarse deliberadamente. Producción falla en bootstrap si métricas
no usan `bearer` o el token tiene menos de 32 caracteres.

## Diagnóstico

1. Para readiness, ubique la dependencia `down`, revise `docker compose ps` y logs del servicio.
2. Para trazas ausentes, compruebe flags, endpoint OTLP, `13133` y logs de `otel-collector`.
3. Para alertas ausentes, compruebe flags, `9093`, logs de Alertmanager y `/events` del receptor.
4. Para `401` de métricas, confirme modo y Bearer; no habilite acceso público como atajo.
5. Ejecute `pnpm infra:verify` para probar protocolos y persistencia.
6. No elimine volúmenes para resolver health checks.

Una falla de exportación o entrega se registra y cuenta en métricas, pero la API continúa. Al iniciar,
la primera evaluación consulta alertas activas de Alertmanager; si falla o el contrato no es válido no
establece baseline y reintenta en el siguiente readiness. Revise los eventos
`dependency_alert_state_hydrated`/`dependency_alert_state_hydration_failed` sin copiar respuestas.

## Seguridad

Los servicios se ligan a localhost por defecto. El Collector debug y el receptor son herramientas de
desarrollo; no sustituyen almacenamiento, retención, TLS, autenticación ni routing productivos.
Nunca publique logs o traces completos en tickets sin revisar redacción y PII.
