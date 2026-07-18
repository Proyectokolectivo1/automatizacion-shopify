# Runbook de export operativo E6-H7A

Valores seguros:

```dotenv
OPERATIONAL_EXPORT_ENABLED=false
OPERATIONAL_EXPORT_KILL_SWITCH=true
```

Para una prueba local habilite la feature, abra el kill switch, reinicie API/web y ejecute
`pnpm operations:verify` y `pnpm web:verify`.

- `400`: filtro/rango inválido o superior a 7 días.
- `401/403`: sesión, rol o tenant no autorizado.
- `429`: más de cinco solicitudes en la ventana; espere el desbloqueo configurado.
- `503`: feature cerrada.
- Métrica: `ecommerce_api_operational_export_operations_total{outcome}`.
- Auditoría: `operations.export.generated` / `operations.export.failed`.

Para contención inmediata cierre el kill switch y reinicie la API. No hay archivos que borrar ni
jobs que cancelar. Revise auditoría por usuario/tenant, no copie el CSV a tickets.
