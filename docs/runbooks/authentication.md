# Runbook de autenticación

Actualizado: 2026-07-12

Ejecute `pnpm auth:verify` para validar la vertical en una base temporal. La suite crea usuarios y
organizaciones solo dentro de esa base y elimina todo al finalizar.

No existe registro público ni usuario administrador predeterminado. No inserte passwords manualmente:
la creación inicial llegará con invitaciones E0-H5B. Ante compromiso, establezca `revoked_at` mediante
una operación administrativa auditada cuando exista; en desarrollo puede detener la API y corregir
hacia adelante, conservando auditoría.

Señales útiles: `ecommerce_api_auth_events_total`, respuestas 401/403/429 y `audit_logs`. Nunca copie
tokens o hashes completos a tickets o logs. Si se reutiliza un refresh, la sesión completa queda
revocada y el usuario debe autenticarse de nuevo.

El proxy productivo y la política de IP confiable aún no están definidos. No habilite producción
hasta configurar HTTPS, CORS, CSP, CSRF/cookies y el proxy de forma verificable.
