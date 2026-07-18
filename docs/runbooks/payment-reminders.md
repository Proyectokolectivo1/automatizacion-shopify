# Runbook de recordatorios de pago

Para simulación habilite `PAYMENT_REMINDERS_ENABLED`, desactive el kill switch y conserve
`PAYMENT_REMINDERS_SIMULATION_MODE=true`. El scheduler usa intervalo y batch configurables.

Ante duplicados o envíos inesperados active inmediatamente `PAYMENT_REMINDERS_KILL_SWITCH=true` y
revise `payment_reminders`, outbox, auditoría y la métrica de operaciones de intención con
`action=reminder`. Nunca cambie filas manualmente ni habilite WhatsApp real desde este flujo.
