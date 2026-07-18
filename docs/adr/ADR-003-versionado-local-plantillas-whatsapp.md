# ADR-003 — Versionado local de plantillas WhatsApp

Estado: aceptada para E3-H2A, 2026-07-14.

## Contexto

La plataforma necesita asociar eventos operativos con plantillas WhatsApp, pero todavía no dispone
de credenciales Meta ni de una verificación contractual en un entorno controlado. Una aprobación
local no puede confundirse con la revisión real de Meta.

## Decisión

Se mantiene un catálogo local por organización y tienda. Cada cambio de contenido crea una fila
inmutable con el mismo `templateKey` y una versión ascendente. Los únicos estados locales son
`local_draft`, `simulated_approved` y `simulated_rejected`; solo el segundo admite activación. Existe
como máximo una versión activa por tienda, evento e idioma.

La conexión WhatsApp debe existir, aunque puede estar desactivada para preparar borradores. Crear,
versionar, revisar, activar y desactivar son operaciones transaccionales, idempotentes y auditadas.
No se llama a Meta ni se asigna un identificador remoto.

## Consecuencias

- E3-H3A podrá resolver una versión activa sin depender de contenido mutable.
- Un cambio de texto o variables requiere una nueva versión y revisión simulada.
- La revisión real, el mapeo de estados Meta y la sincronización remota permanecen
  `BLOQUEADO_POR_CREDENCIALES`.
