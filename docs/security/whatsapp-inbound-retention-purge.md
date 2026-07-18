# Seguridad de la purga inbound

- Flags y kill switch quedan cerrados por defecto.
- La selección exige `retention_expires_at <= now` y ciphertext todavía presente.
- El trigger impide borrar antes del deadline, restaurar ciphertext o cambiar fingerprint/fecha.
- Auditoría registra solo tenant, acción y conteo de lote; nunca mensaje, teléfono, hash o contenido.
- Prometheus usa un único resultado enumerado, sin tenant ni IDs.
- Se conserva el hash de remitente para continuidad de conversación; su retención legal sigue
  pendiente de aprobación y no queda resuelta por esta purga de contenido.
- No hay endpoint público, borrado de filas, outbox ni tráfico externo.

La política de retención real, derechos de titulares y alcance de hashes/snapshots debe aprobarse antes
de abrir Meta. Esta vertical solo ejecuta el deadline durable ya configurado.
