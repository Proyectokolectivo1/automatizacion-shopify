# ADR-004 — Aceptación simulada de mensajes WhatsApp

Estado: aceptada para E3-H3A, 2026-07-14.

## Contexto

La plataforma debe generar mensajes transaccionales idempotentes, pero no dispone de credenciales Meta
ni de un webhook de estados verificado. Presentar una aceptación local como envío real produciría una
afirmación operacional falsa.

## Decisión

E3-H3A persiste exclusivamente `SIMULATED_ACCEPTED` mediante un proveedor determinista sin red. La
clave de negocio es organización/tienda/evento/pedido/versión de plantilla. El mensaje conserva el
cuerpo renderizado, pero respuesta, outbox, auditoría y métricas omiten PII y valores. Los timestamps de
envío, entrega, lectura y fallo permanecen nulos e invalidados por constraints.

## Consecuencias

- Replay y concurrencia no crean entregas duplicadas.
- Ningún consumidor puede interpretar el estado v1 como confirmación de Meta.
- E3-H4A debe incorporar estados solo mediante eventos simulados autenticados y monotónicos.
- El adaptador Meta real, su worker y webhooks permanecen `BLOQUEADO_POR_CREDENCIALES` hasta validación
  contractual y de seguridad.
