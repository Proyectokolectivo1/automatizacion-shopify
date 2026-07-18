# Contrato HTTP de observabilidad v1

Estado: implementado en E0-H3/E0-H3B. Todos los timestamps usan UTC ISO 8601.

## Correlación y trazas

- Entrada/salida: `x-correlation-id`.
- Salida: `x-trace-id` y `x-span-id` para toda petición instrumentada.
- Se acepta un correlation ID de 1 a 128 caracteres formado por letras, números, `.`, `_`, `:` o
  `-`; un valor ausente o inseguro se reemplaza por UUID v4.
- Si `OTEL_TRACING_ENABLED=true`, se extrae `traceparent` W3C válido y se continúa su trace; si no
  existe, se crea uno nuevo.
- Correlation, trace y span ID aparecen en los logs de la petición, pero nunca en labels métricos.

## `GET /health/live`

Comprueba únicamente que el proceso HTTP responde. No depende de proveedores.

```json
{
  "service": "api",
  "status": "ok",
  "timestamp": "2026-07-17T20:00:00.000Z"
}
```

## `GET /health/ready`

Ejecuta comprobaciones acotadas por timeout contra PostgreSQL, Redis y MinIO.

- `200`: todas las dependencias están `up`.
- `503`: al menos una dependencia está `down`.
- No expone direcciones, credenciales ni mensajes internos.
- Las alertas observan el resultado, pero su entrega no modifica el status ni el body.

## `GET /metrics`

Devuelve formato Prometheus y siempre agrega `Cache-Control: no-store`.

`METRICS_ACCESS_MODE` define el acceso:

- `loopback` (default): solo acepta la dirección real del socket local; ignora headers reenviados.
- `bearer`: exige `Authorization: Bearer <METRICS_BEARER_TOKEN>` y compara su hash en tiempo constante.
- `disabled`: responde `401`.

Producción exige modo `bearer` y un token de al menos 32 caracteres. Las etiquetas HTTP se limitan a
método, patrón de ruta y código; nunca usan URL completa, query, IDs o datos personales.

## Errores HTTP

```json
{
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Cannot GET /missing",
  "correlationId": "b27b8e47-6454-4ed3-bf8a-204cd2cd8a11",
  "timestamp": "2026-07-17T20:00:00.000Z",
  "path": "/missing"
}
```

Los errores 5xx siempre usan `Internal server error`; el detalle queda únicamente en logs redactados.
