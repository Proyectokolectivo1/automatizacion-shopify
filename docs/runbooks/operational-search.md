# Runbook de búsqueda operativa E6-H5A

## Activación

Los valores seguros por defecto son:

```dotenv
OPERATIONAL_SEARCH_ENABLED=false
OPERATIONAL_SEARCH_KILL_SWITCH=true
```

Para una prueba local controlada, habilite la feature y abra el kill switch, reinicie la API y
ejecute `pnpm operations:verify`. Para detenerla de inmediato use
`OPERATIONAL_SEARCH_KILL_SWITCH=true` y reinicie la API.

## Diagnóstico

- `400`: consulta, ventana, filtro o cursor inválido/incompatible.
- `401/403`: sesión ausente o rol/organización no autorizados.
- `503`: feature deshabilitada o kill switch cerrado.
- Métrica: `ecommerce_api_operational_search_operations_total{outcome}`.
- Auditoría: `operations.search.executed` y `operations.search.failed`.

No copie términos de búsqueda a logs o tickets. Verifique solo clase de término, filtros, ventana y
conteo desde auditoría. La recuperación no requiere migración ni reproceso.
