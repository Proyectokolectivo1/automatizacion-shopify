# Contrato E3-H6A — bandeja WhatsApp simulada

## Acceso

Todas las rutas requieren sesión, pertenencia a la organización y permiso
`whatsapp-conversations.read`. Solo owner, admin, operations y support lo reciben. Las respuestas usan
`Cache-Control: no-store` y el módulo permanece cerrado por flags y kill switch propios.

## Listado

`GET /operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations`

Query opcional:

- `limit`: 1 a 100, default 20;
- `cursor`: cursor opaco de máximo 512 caracteres;
- `status`: `open` o `closed`;
- `identity`: `known_customer` o `unknown_contact`.

La respuesta contiene `conversationId`, identidad acotada, estado, último timestamp, dirección/estado
del último mensaje y conteo. No incluye nombres, teléfono, texto, hashes ni IDs de proveedor. El orden
es `lastMessageAt DESC, conversationId DESC` y `nextCursor` continúa esa clave compuesta.

## Timeline

`GET /operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations/:conversationId/messages`

Acepta `limit`, `cursor` y `direction=inbound|outbound`. Devuelve mensajes por
`createdAt DESC, messageId DESC`, con dirección, tipo, estado, contenido autorizado y el historial de
estados aplicado/observado. Nunca incluye teléfono ni identificador externo.

El contenido inbound se descifra únicamente si `retentionExpiresAt` sigue vigente; después responde
`content=null` y `contentState=expired`. Un cursor inválido responde 400; recurso ajeno/inexistente,
404; falta de permiso, 403; controles cerrados, 503.
