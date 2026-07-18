# Runbook de detalle operativo E6-H6A

Valores seguros:

```dotenv
OPERATIONAL_DETAIL_ENABLED=false
OPERATIONAL_DETAIL_KILL_SWITCH=true
WEB_DETAIL_REFERENCE_KEY=
```

`pnpm infra:bootstrap` genera la clave local. En producción suministre una clave base64url aleatoria
de 32 bytes por secret manager. Para habilitar una prueba controlada, active la feature, abra el kill
switch y reinicie API/web.

- `400`: referencia inválida, expirada o parámetro mal formado.
- `401/403`: sesión, rol o tenant no autorizado.
- `404`: recurso no disponible, sin revelar si existe en otro tenant.
- `503`: feature cerrada o clave productiva inválida/ausente.
- Métrica: `ecommerce_api_operational_detail_operations_total{outcome}`.
- Auditoría: `operations.detail.viewed` / `operations.detail.view_failed`.

Para contención inmediata cierre `OPERATIONAL_DETAIL_KILL_SWITCH=true` y reinicie la API. Rotar
`WEB_DETAIL_REFERENCE_KEY` invalida todas las referencias activas sin tocar datos.
