# Runbook de alertas operativas

## Habilitar de forma controlada

1. Confirmar `pnpm database:status` en 30/30 y ejecutar `pnpm alerts:verify`.
2. Definir `OPERATIONAL_ALERTS_ENABLED=true`.
3. Mantener inicialmente `OPERATIONAL_ALERTS_KILL_SWITCH=true`.
4. Ajustar lote, intervalo y lookback dentro de límites validados.
5. Reiniciar API y, en ventana controlada, cambiar kill switch a `false` y reiniciar.
6. Verificar auditoría y `ecommerce_api_operational_alert_operations_total`.

La configuración se carga al iniciar; un cambio requiere reinicio.

## Diagnóstico

- 503: revisar enabled/kill switch del proceso.
- no aparecen alertas: confirmar que el recurso cae dentro de `[now-lookback, now)` y que el read
  model lo marca `requires_attention`.
- alertas antiguas abiertas: revisar fallos `outcome="failure"`, conectividad PostgreSQL y logs por
  correlation ID.
- duplicado abierto: tratar como incidente de integridad; el índice parcial debe impedirlo.
- tenant no avanza: revisar tamaño de lote; el cursor recorre lotes y reinicia tras alcanzar el final.

## Contención y recuperación

Activar `OPERATIONAL_ALERTS_KILL_SWITCH=true` y reiniciar para detener evaluación y lectura. Esto no
elimina filas. Al recuperar PostgreSQL/configuración, reactivar y esperar el siguiente ciclo: replay
refresca o resuelve idempotentemente. Nunca borrar volúmenes como procedimiento de recuperación.

## Fuera de alcance

No enviar alertas a email/WhatsApp, no editar estados manualmente, no exportar y no conectar destinos
reales. Esos cambios requieren otra vertical y aprobación explícita.
