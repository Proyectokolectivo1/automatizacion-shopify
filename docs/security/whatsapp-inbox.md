# Seguridad — bandeja WhatsApp simulada

- RBAC default-deny: solo owner, admin, operations y support leen conversaciones.
- Organización, tienda y conversación forman parte de cada lookup; un store/conversation ajeno es 404.
- El listado no selecciona ni devuelve nombre, teléfono, texto, hash o identificador de proveedor.
- El timeline omite teléfono/IDs externos y solo entrega contenido a una sesión autorizada.
- Un inbound vencido nunca se pasa al descifrador y responde `contentState=expired`.
- AES-GCM valida AAD organización/tienda/mensaje; un sobre intercambiado falla cerrado.
- Cursores inválidos fallan 400 y no contienen PII; límites/filtros son enumeraciones acotadas.
- `Cache-Control: no-store` evita caching HTTP compartido; logs, auditoría y métricas no reciben texto.
- Flags de integración e inbox, modo simulación y kill switch deben estar abiertos conjuntamente.
- No hay búsqueda por teléfono, respuesta de mensajes ni tráfico Meta. La asignación simulada se
  controla separadamente según `whatsapp-conversation-assignments.md`.
