# Seguridad de plantillas WhatsApp locales

- Organización y tienda se verifican en RBAC, consultas y FK compuesta.
- Se exige una conexión WhatsApp del mismo tenant; no es necesario activarla para preparar borradores.
- La API real permanece inaccesible: no hay adaptador Meta vinculado ni credenciales en esta vertical.
- Cuerpo y variables no se copian a auditoría, métricas ni outbox.
- Los campos, tamaños, slugs, idioma, evento, estado y forma JSON están limitados en API y base.
- Solo una revisión denominada `simulated_approved` permite activar; nunca se devuelve `approved`.
- Todas las mutaciones usan clave idempotente hasheada y transacción serializable.

Antes de introducir datos reales debe aprobarse la política de PII/retención, revalidarse la
documentación oficial y ejecutarse un contrato contra Meta con credenciales separadas.
