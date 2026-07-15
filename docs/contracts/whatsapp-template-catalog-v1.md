# Contrato v1 — catálogo local de plantillas WhatsApp

Este contrato es exclusivamente local y devuelve siempre `mode=simulation`. Los nombres de campos
`name`, `language`, `category` y `components` de la muestra oficial de Meta se usaron solo como
referencia conceptual; no se implementó ninguna llamada Graph API ni se asumió una aprobación real.

## Contenido

- `name`: slug interno en minúsculas.
- `metaTemplateName`: nombre candidato para una futura integración, sin registro remoto.
- `languageCode`: código como `es_CO`.
- `category`: `AUTHENTICATION`, `MARKETING` o `UTILITY` en entrada.
- `bodyTemplate`: máximo 4.096 caracteres.
- `variablesSchema`: `{ version: "v1", variables: [...] }`, hasta 20 variables únicas.
- `eventType`: evento interno estable.

Los placeholders tienen la forma `{{variable_name}}`. Cada placeholder debe existir exactamente en
el esquema y cada variable declarada debe usarse en el cuerpo. Los tipos v1 son `TEXT`, `URL`,
`CURRENCY` y `DATE`.

## Endpoints autenticados

Base: `/integrations/organizations/:organizationId/whatsapp/stores/:storeId/templates`.

- `GET /?limit=&cursor=` lista versiones del tenant.
- `POST /` crea la versión 1.
- `POST /:templateKey/versions` crea una nueva versión inmutable.
- `POST /:templateId/review` acepta `APPROVE` o `REJECT`; rechazo exige `reasonCode`.
- `POST /:templateId/activate` activa solo una revisión simulada aprobada.
- `POST /:templateId/deactivate` desactiva una versión activa.

Todas las mutaciones exigen `Idempotency-Key`. Owner/admin usan el permiso existente
`integration.manage`; un lookup de otro tenant no revela el recurso.

## Eventos v1

`whatsapp.template.created.v1`, `version-created.v1`, `reviewed.v1`, `activated.v1` y
`deactivated.v1`. El payload contiene únicamente identificadores, versión, estado, activo, tienda y
modo; no replica cuerpo ni esquema de variables.
