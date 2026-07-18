# ADR-006 — Mensajes entrantes WhatsApp exclusivamente simulados

Fecha: 2026-07-15

Estado: aceptada para E3-H5A

## Contexto

La futura bandeja necesita conversaciones y mensajes inbound durables antes de disponer de una app
Meta, credenciales, payload oficial validado o política legal definitiva de retención. Guardar texto
o teléfono en evidencias operativas elevaría exposición y acoplaría la simulación al contrato real.

## Decisión

- El ingreso v1 acepta únicamente un fixture sintético estricto autenticado con el HMAC sintético ya
  separado del token de envío.
- Un mensaje se persiste como `text/simulated_received`, con contenido AES-256-GCM, AAD por mensaje y
  fecha de vencimiento; nunca usa `body` en claro.
- Un cliente conocido puede vincular teléfono/conversación dentro de su tienda. Un desconocido queda
  sin teléfono ni cliente y se vincula mediante HMAC tenant-safe.
- El HMAC de identidad usa el keyring versionado. Se consultan versiones históricas conservadas y se
  migra el hash a la versión actual al siguiente mensaje.
- Evento externo y mensaje son inmutables; evento y mensaje tienen dedupe independiente y las
  colisiones fallan cerradas.
- Respuesta, outbox, auditoría y métricas excluyen teléfono, texto e ID externo del proveedor.
- E3-H5A no responde mensajes ni ofrece bandeja. Esas capacidades pertenecen a E3-H6/E3-H7.

## Consecuencias

E3-H6A puede consumir IDs internos y contenido cifrado sin inventar tráfico Meta. La apertura real
continúa bloqueada por credenciales, revalidación del contrato oficial y una purga de retención
operativa; el fixture v1 no se reinterpretará como payload Meta.
