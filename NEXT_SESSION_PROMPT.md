# Prompt para la siguiente sesión

Actualizado: 2026-07-17

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C, E0-H3B,
E1-H1A a E1-H5A, E2-H1A a E2-H6A, E3-H1A a E3-H7A y E6-H1A/H2A están completas. E6-H3A es la
siguiente vertical.

Repositorio: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. Rama
`codex/foundations-e0-h2`, PR borrador #1. El bloque hasta E6-H1A fue publicado en `d1755f1`; revisa
el log para el commit E6-H2A. No hagas commit/push adicional sin petición del usuario. GitHub CLI usa
el keyring. No uses el PAT expuesto y confirma su revocación antes de aceptar credenciales nuevas.

Usa siempre la skill `token-optimizer`: ejecuta su diagnóstico Codex read-only y aplica su disciplina
de contexto. No instales hooks, compact prompt, status line ni configuración global sin aprobación.

Lee por completo las fuentes maestras, controles vivos, `PROJECT_OVERVIEW.md`, `SESSION_LOG.md`,
`docs/architecture/project-continuity.md` y la documentación E6-H1A/H2A antes de editar. Actualiza
todos los controles y el log append-only cuando cambie el estado.

## Baseline

Ejecuta instalación congelada, `pnpm validate`, integración, database/outbox/DLQ/auth/identity,
todos los gates Shopify/Wompi/WhatsApp/operations, migraciones, observabilidad, infraestructura y
`pnpm audit --prod`. Ejecuta en serie las suites que llaman `prisma generate`; no borres volúmenes.

Baseline al cierre de E6-H2A: `pnpm validate` con 20 archivos/73 pruebas y 100 % crítico,
`pnpm operations:verify` 7/7, `pnpm whatsapp:verify` 25/25, `pnpm database:verify` 15/15 y 28/28
migraciones. Todos los gates funcionales, observabilidad, infraestructura y auditoría están verdes.
El compose local se deja detenido con volúmenes persistentes.

## Siguiente vertical exacta: E6-H3A

Construye la base segura del dashboard Next.js de solo lectura antes de añadir visualizaciones:

- decidir y documentar un flujo BFF/sesión web que use cookies `HttpOnly`, `Secure` en producción y
  `SameSite`, sin exponer el access token a JavaScript ni guardarlo en localStorage/sessionStorage;
- incorporar protección CSRF para toda ruta web que cree/rote/revoque sesión y mantener CORS/orígenes
  default-deny; no debilitar el contrato API Bearer existente para clientes no web;
- seleccionar organización solo desde membresías activas retornadas por backend y revalidar tenant en
  cada request; nunca confiar en un ID conservado por el navegador;
- crear un shell accesible de dashboard y estados loading/empty/error que consuman resumen/cola a
  través del BFF, sin mostrar PII, payloads o IDs externos;
- mantener filtros/rangos acotados y cursores opacos; no sumar páginas parciales para simular totales;
- añadir pruebas unitarias y E2E/HTTP para cookie flags, CSRF, logout/revocación, RBAC, tenant, ausencia
  de tokens en HTML/storage/logs y degradación segura de la API;
- activar el gate web correspondiente en CI y documentar arquitectura, contrato, seguridad, pruebas y
  runbook antes de marcarla completa;
- no añadir mutaciones operativas, alertas automáticas, exports, proveedores reales ni despliegue.

Conserva las garantías previas: la atención v1 solo vive en `operational-read-model.ts`; el resumen
usa `[from,to)` <=31 días; Collector/alertas no tumban API; métricas productivas exigen Bearer;
contenido WhatsApp vencido no se descifra. TD-023/024/025/026 y R-018 siguen abiertas. Proveedores
reales permanecen bloqueados.
