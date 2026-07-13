# Contrato HTTP de observabilidad v1

Estado: implementado en E0-H3. Todos los timestamps usan UTC ISO 8601.

## Correlación

- Header de entrada/salida: `x-correlation-id`.
- Se acepta un valor de 1 a 128 caracteres formado por letras, números, `.`, `_`, `:` o `-`.
- Un valor ausente o inseguro se reemplaza por UUID v4.
- El mismo identificador aparece en respuestas de error y logs de la petición.

## `GET /health/live`

Comprueba únicamente que el proceso HTTP responde. No depende de proveedores.

```json
{
  "service": "api",
  "status": "ok",
  "timestamp": "2026-07-12T20:00:00.000Z"
}
```

## `GET /health/ready`

Ejecuta comprobaciones acotadas por timeout contra PostgreSQL, Redis y MinIO.

- `200`: todas las dependencias están `up`.
- `503`: al menos una dependencia está `down`.
- No expone direcciones, credenciales ni mensajes internos.

```json
{
  "status": "ready",
  "timestamp": "2026-07-12T20:00:00.000Z",
  "dependencies": [
    { "name": "postgres", "status": "up", "latencyMs": 3 },
    { "name": "redis", "status": "up", "latencyMs": 2 },
    { "name": "minio", "status": "up", "latencyMs": 5 }
  ]
}
```

## `GET /metrics`

Devuelve formato de exposición Prometheus. Las etiquetas HTTP se limitan a método, patrón de ruta y
código; nunca usan URL completa, query string, identificadores de pedido o datos personales.

En producción esta ruta deberá restringirse en el reverse proxy o mediante autorización técnica.

## Errores HTTP

```json
{
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Cannot GET /missing",
  "correlationId": "b27b8e47-6454-4ed3-bf8a-204cd2cd8a11",
  "timestamp": "2026-07-12T20:00:00.000Z",
  "path": "/missing"
}
```

Los errores 5xx siempre usan `Internal server error`; el detalle queda únicamente en logs redacted.
