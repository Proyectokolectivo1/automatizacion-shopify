# Prompt para la siguiente sesión

Actualizado: 2026-07-15

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C, E1-H1A a E1-H5A,
E2-H1A a E2-H6A y E3-H1A a E3-H5A están completas; E0-H3B permanece pendiente. No reinicies ni
reemplaces trabajo válido.

Repositorio canónico: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. La rama de
trabajo publicada es `codex/foundations-e0-h2` y el PR borrador #1 está abierto. GitHub CLI está
autenticado mediante keyring. Antes de usar nuevas credenciales, confirmar que el PAT expuesto fue
revocado.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md`, `SESSION_LOG.md` y los nueve archivos de control.
4. `docs/architecture/project-continuity.md`.
5. `docs/adr/ADR-006-mensajes-entrantes-whatsapp-simulados.md` y la documentación E3-H5A.

Actualiza el resumen vivo, todos los controles y agrega una entrada append-only a `SESSION_LOG.md` al
cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm dlq:verify`, `pnpm auth:verify`,
`pnpm identity:verify`, `pnpm shopify:verify`, `pnpm shopify:webhooks:verify`,
`pnpm shopify:orders:verify`, `pnpm orders:classification:verify`,
`pnpm shopify:reconciliation:verify`, `pnpm transport-rates:verify`, `pnpm wompi:verify`,
`pnpm whatsapp:verify`, `pnpm database:status`, `pnpm observability:verify`, `pnpm audit --prod` y
`pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E3-H6A

Implementa una bandeja de conversaciones WhatsApp únicamente en simulación:

- listado paginado y tenant-safe de conversaciones, con cursor estable y filtros acotados;
- timeline paginado de mensajes inbound/outbound y estados, preservando orden determinista;
- RBAC default-deny y lookup no revelador entre organizaciones/tiendas;
- descifrado del texto inbound solo en la consulta autorizada y nunca después de
  `retentionExpiresAt`;
- respuestas, auditoría, outbox, errores, logs y métricas sin teléfono, texto ni hashes de alta
  cardinalidad;
- replay/consulta concurrente, cursor inválido, conversación ajena, contenido vencido y kill switch
  cubiertos;
- no responder mensajes, asignar agentes, aceptar payload Meta real ni crear una UI final todavía.

Conserva el contrato inbound sintético v1, las 26 migraciones y los gates anteriores. La purga física
del contenido vencido está registrada como TD-023 y bloquea tráfico real; no la presentes como
resuelta por ocultar el texto en la API. Meta real sigue `BLOQUEADO_POR_CREDENCIALES`.

Baseline al cierre: `pnpm validate` verde con 20 archivos/69 pruebas unitarias y cobertura crítica al
100 %, `pnpm whatsapp:verify` 17/17, `pnpm database:verify` 14/14 y 26 migraciones; integración,
regresiones, observabilidad e infraestructura verdes. Migraciones 24/25/26 aplicadas localmente.
`pnpm audit --prod` continúa bloqueado por HTTP 410 del endpoint npm retirado.
