# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C y E0-H4C están completas;
E0-H3B permanece pendiente. No reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control.

Actualiza el resumen vivo y todos los controles al cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm dlq:verify`, `pnpm auth:verify`,
`pnpm identity:verify`, `pnpm database:status`, `pnpm observability:verify`, `pnpm audit --prod` y
`pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E1-H1A

Implementa el registro de integraciones y la gestión mínima de tiendas Shopify sin credenciales
reales:

- modelo tenant-safe de integración/tienda, estados explícitos y migración expand-only;
- interfaz de proveedor Shopify y adaptador mock determinista con fixtures versionados;
- prueba contractual del mock para conectar/probar conexión/activar/desactivar;
- token cifrado en reposo con AES-256-GCM, versión de clave y AAD tenant+tienda; nunca texto plano;
- clave por entorno fuera de argumentos, logs, respuestas y Git; rotación diseñada y probada;
- feature flag, modo simulación y kill switch cerrados por defecto;
- API owner/admin idempotente para registrar, probar, activar y desactivar una tienda;
- dominio Shopify normalizado y único, tenant ajeno no revelado y SSRF bloqueado;
- locks, snapshot idempotente y auditoría/métricas acotadas sin dominio completo ni token;
- pruebas PostgreSQL/HTTP de duplicado, carreras, replay, tenant, RBAC, cifrado y controles;
- contrato, arquitectura, seguridad, runbook, pruebas y los diez controles actualizados.

Registra la conexión real como `BLOQUEADO_POR_CREDENCIALES`. No llames Shopify, no habilites correo
real, no implementes webhooks E1-H2, pedidos, dashboard, despliegue ni credenciales reales. Mantén
E0-H3B pendiente y no presentes el mock como integración productiva terminada.
