# Recordatorios de pago de transporte

E2-H4A interpreta la línea temporal maestra así: hora 0 crea la intención/enlace, horas 8 y 16 son
los dos recordatorios máximos y hora 24 pertenece al vencimiento E2-H5. Cada intención nueva crea dos
filas `payment_reminders` tenant-safe dentro de la misma transacción.

El scheduler reclama vencidos con `FOR UPDATE SKIP LOCKED`. Si la intención sigue `PENDING` y vigente,
marca `REQUESTED` y crea `payment.reminder.requested.v1` atómicamente. Si cambió de estado o venció,
cancela fail-closed. El webhook cancela de inmediato recordatorios aún programados al salir de
`PENDING`. No se envía WhatsApp en esta vertical.
