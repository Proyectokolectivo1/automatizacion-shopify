# Prompt para la siguiente sesión

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H4 y E0-H5A están completas.
No reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control.

Actualiza el resumen vivo y todos los controles al cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm auth:verify`, `pnpm database:status`,
`pnpm observability:verify`, `pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E0-H5B

Completa invitaciones y recuperación sin proveedor real:

- migración expand-only para tokens de invitación/recuperación, guardando solo hash;
- token CSPRNG de un uso, propósito explícito, expiración, revocación y consumo atómico;
- invitación que crea o vincula usuario/membresía sin permitir escalamiento de rol;
- recuperación con respuesta uniforme, rotación de password Argon2id y revocación de sesiones;
- adaptador de correo, fixtures y pruebas contractuales en simulación;
- feature flag, kill switch y fallo cerrado para modo real sin proveedor;
- rate limit, auditoría y métricas sin correo/token/password en logs;
- pruebas PostgreSQL/HTTP de expiración, replay, tenant, rol, respuesta perdida y concurrencia;
- contrato, seguridad, runbook y actualización completa de controles.

No habilites correo real: DP-001 sigue `BLOQUEADO_POR_DECISION`. Mantén E0-H3B y E0-H4C
pendientes. No despliegues ni uses credenciales reales.
