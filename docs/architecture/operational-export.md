# Export operativo acotado E6-H7A

La API devuelve un máximo de 1.000 filas JSON del read model compartido dentro de `[from,to)` de
hasta 7 días. No crea archivos. El BFF valida el contrato, serializa CSV UTF-8 en memoria y responde
como attachment `no-store`; no usa MinIO, disco ni tablas adicionales.

El permiso masivo `operations.export.read` se limita a OWNER/ADMIN. Cada usuario+organización+IP
consume el rate limit durable existente con scope independiente; la sexta solicitud dentro de la
ventana queda bloqueada. El botón se oculta para otros roles y se deshabilita si existe una búsqueda
activa o el rango supera 7 días.
