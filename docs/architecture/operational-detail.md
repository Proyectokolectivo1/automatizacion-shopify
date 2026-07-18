# Detalle operativo mínimo E6-H6A

E6-H6A añade navegación de solo lectura desde la cola o búsqueda hacia una proyección discriminada
para los cinco tipos operativos. La API localiza el recurso mediante organización, tipo y UUID, pero
el navegador nunca recibe esos identificadores.

El BFF cifra `{organizationId,type,itemId,expiresAt}` con AES-256-GCM y AAD versionado. La referencia
expira en 15 minutos, se valida contra el tenant de `/auth/me` y solo entonces se llama a la API. En
producción `WEB_DETAIL_REFERENCE_KEY` es obligatorio; desarrollo usa una clave efímera si falta.

La API relee primero el read model compartido para conservar estado y política de atención. Después
selecciona una allowlist por tipo. Solo pedidos y asignaciones WhatsApp ofrecen timeline, limitado a
25 eventos y sin metadata, razones libres, actores ni relaciones.
