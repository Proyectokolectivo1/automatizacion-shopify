# Seguridad de recordatorios de pago

La base limita dos secuencias por intención y exige coherencia entre estado y timestamps. Locks con
`SKIP LOCKED`, unique intent+sequence y escritura atómica del outbox evitan duplicados concurrentes.
El evento no incluye PII, teléfono, checkout URL, referencia, firma ni secretos.

Flags, modo simulación y kill switch fallan cerrados. Cualquier intención no pendiente o vencida se
cancela sin solicitar mensajería.
