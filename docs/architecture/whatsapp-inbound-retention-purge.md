# Purga de contenido inbound WhatsApp simulado

E3-H8A elimina físicamente los dos campos derivados del texto al vencer `retention_expires_at`:
`encrypted_body_json` y `content_fingerprint`. El registro de mensaje, relaciones, estado,
`sender_hash`, timestamps y evento webhook redactado se conservan para continuidad operativa.

El scheduler está cerrado por defecto. Cuando se habilita, toma lotes acotados ordenados por deadline
con `FOR UPDATE SKIP LOCKED`; un advisory lock transaccional impide dos coordinadores activos. Cada
lote actualiza y crea auditoría agregada por organización dentro de la misma transacción.

PostgreSQL refuerza la transición: solo un mensaje inbound con ciphertext presente puede pasar una
vez a contenido nulo, `content_purged_at` debe ser igual o posterior al deadline y el resto de campos
inmutables no cambia. Un índice parcial cubre únicamente contenido pendiente de purga.

No se borra el mensaje, no se publica outbox y no se llama a Meta. El timeline ya trataba contenido
vencido como `expired`; después de la purga conserva esa proyección sin descifrar.
