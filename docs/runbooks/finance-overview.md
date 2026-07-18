# Runbook — resumen financiero local

Actualizado: 2026-07-18.

## Habilitar en desarrollo

```dotenv
FINANCE_OVERVIEW_ENABLED=true
FINANCE_OVERVIEW_KILL_SWITCH=false
```

Reinicie la API para aplicar cambios. Mantenga el kill switch en `true` fuera del entorno donde se haya
aprobado la exposición de cartera simulada.

## Verificar

```powershell
pnpm infra:up
pnpm finance:verify
pnpm infra:down
```

Use un token owner/admin/finance y fechas ISO con offset. Una respuesta vacía válida devuelve total
`count=0`, `amountMinor="0"` y `byStatus=[]`.

## Diagnóstico

- `400`: valide orden de fechas y máximo 31 días.
- `403`: confirme membresía activa y permiso `finance.overview.read` en el mismo tenant.
- `503 Finance overview is disabled`: revise flag/kill switch y reinicie el proceso.
- `503 Finance overview is unavailable`: no fuerce defaults; revise contrato de filas/conteos y base.

No interprete el agregado como saldo o recaudo. Para contrastarlo con un proveedor real hacen falta
credenciales, liquidaciones y una decisión contable explícita.
