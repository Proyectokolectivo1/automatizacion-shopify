# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C y E1-H1A están
completas; E0-H3B permanece pendiente. No reinicies ni reemplaces trabajo válido.

Repositorio canónico: <https://github.com/Proyectokolectivo1/automatizacion-shopify>, rama `main`.
Antes de usar nuevas credenciales, confirmar que el PAT expuesto en la conversación fue revocado.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control.

Actualiza el resumen vivo y todos los controles al cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm dlq:verify`, `pnpm auth:verify`,
`pnpm identity:verify`, `pnpm shopify:verify`, `pnpm database:status`,
`pnpm observability:verify`, `pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E1-H2A

Implementa recepción de webhooks Shopify únicamente en simulación:

- migración expand-only para eventos webhook con ownership tenant, tienda, topic, identificador,
  estado, timestamps e índices;
- preservar bytes del cuerpo crudo y validar HMAC-SHA256 con comparación constante antes de parsear;
- secreto simulado fuera de Git, versionado/cifrado, feature flag, modo simulación y kill switch;
- aceptar solo topics allowlist y tienda activa visible; límites de tamaño y JSON inválido seguros;
- deduplicar por tienda+topic+webhookId y responder rápido al duplicado sin repetir efectos;
- persistir evento y outbox atómicamente, luego publicar/procesar por la infraestructura existente;
- fixture versionado de `orders/create`, payload marcado como sintético y sin PII real;
- probar firma válida/inválida, replay, carrera, body alterado, topic no permitido, tenant y caída Redis;
- métricas/auditoría sin HMAC, dominio completo ni payload; contrato, arquitectura, seguridad y runbook;
- mantener registro remoto, pedidos normalizados y conciliación fuera de esta vertical.

La suscripción y conexión real siguen `BLOQUEADO_POR_CREDENCIALES`. No llames Shopify, no habilites
correo real, dashboard, despliegue ni credenciales reales. Mantén E0-H3B pendiente y no presentes
fixtures como pedidos reales.
