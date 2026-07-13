# Prompt para la siguiente sesión

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1, E0-H2, E0-H3 y E0-H4 están
completas. No reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control del repositorio.

Actualiza `PROJECT_OVERVIEW.md` y todos los controles si cambia alcance, estado, pruebas, riesgos o
siguiente paso. No declares integraciones simuladas como reales.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm database:status`,
`pnpm observability:verify`, `pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E0-H5A

Implementa identidad y autorización mínimas, sin construir aún flujos Shopify:

- modelos y migración expand-only para usuarios, membresías organizacionales y sesiones;
- contraseña con algoritmo robusto y parámetros versionados; nunca loguear secretos;
- login local con respuesta uniforme, rate limiting y sesión revocable/expirable;
- roles y permisos aplicados en backend, con default deny y aislamiento entre organizaciones;
- endpoint mínimo protegido que demuestre autenticación y RBAC;
- auditoría de login, revocación y denegación sin guardar contraseña/token;
- pruebas PostgreSQL reales para sesión, expiración, revocación, rol y tenant equivocado;
- adaptador de correo, fixture, contrato, flag, simulación y kill switch, porque el proveedor no está decidido;
- contrato, seguridad, runbook, métricas y actualización completa de controles.

Mantén pendiente E0-H3B y E0-H4C. No despliegues ni uses credenciales reales. Shopify/Wompi/Meta
siguen `BLOQUEADO_POR_CREDENCIALES`, Mastershop `BLOQUEADO_POR_PROVEEDOR` e impresión
`BLOQUEADO_POR_INVENTARIO`.
