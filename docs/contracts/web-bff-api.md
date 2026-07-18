# Contrato web BFF E6-H3A

Actualizado: 2026-07-17

Todas las respuestas usan `Cache-Control: no-store`. Las rutas POST requieren `Origin` exacto; las
autenticadas también exigen cookie/cabecera CSRF coincidentes.

| Ruta                        | Función                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `POST /api/session/login`   | verifica credenciales/opciones y crea cookies HttpOnly      |
| `POST /api/session/refresh` | rota tokens/cookies y CSRF                                  |
| `POST /api/session/logout`  | revoca upstream y solo después expira las cookies           |
| `POST /api/session/switch`  | valida membresía autorizada y rota sesión hacia otro tenant |
| `GET /api/dashboard`        | devuelve resumen, cola mínima y organizaciones autorizadas  |

`GET /api/dashboard` exige `from`/`to` ISO con offset, `from < to`, máximo 31 días; acepta `type` y
`cursor` opaco. Rechaza campos desconocidos, incluido cualquier `organizationId` del navegador.
Devuelve como máximo 25 elementos por página.

Los errores no incluyen respuestas crudas, tokens ni URLs internas. `401` indica sesión ausente o
expirada, `403` origen/CSRF/rol/tenant, `400` contrato inválido, `429` rate limit y `502/503`
degradación de la API.
