# Contrato de recordatorios de pago

`payment.reminder.requested.v1` solicita a la futura capa de mensajería procesar un recordatorio
sintético. Contiene únicamente `reminderId`, `paymentIntentId`, `storeId`, `sequence`, `scheduledAt`,
`provider=wompi` y `mode=simulation`.

La secuencia solo puede ser 1 o 2. Consumidores no deben inferir destinatario, plantilla o URL desde
el evento; deben cargar datos tenant-safe y aplicar sus propios flags. Un replay no crea otro evento.
