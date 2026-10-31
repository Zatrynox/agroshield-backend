# Seguridad — AgroShield API

Este repositorio contiene la API de AgroShield `0.1.0`. El modelo de seguridad completo, las decisiones y los riesgos aceptados están documentados en el monorepo:

- [SECURITY.md del monorepo](https://github.com/Zatrynox/agroshield/blob/main/SECURITY.md)
- [Checklist de lanzamiento](https://github.com/Zatrynox/agroshield/blob/main/docs/launch-checklist.md)

## Alcance

Demo local y revisión. No es una auditoría independiente ni una garantía de cumplimiento. No hay verificación de correo, recuperación de contraseña, MFA, atestación de hardware ni observabilidad centralizada.

## Reportar una vulnerabilidad

Abre un aviso privado en el repositorio principal: <https://github.com/Zatrynox/agroshield/security/advisories/new>. No publiques detalles explotables en un issue público.

## Controles relevantes

- Argon2id, sesión opaca con hash SHA-256, cookie `HttpOnly` y CSRF por cabecera.
- RBAC y filtrado por `organization_id` en todas las consultas.
- Lecturas de sensores firmadas con Ed25519; la clave privada se entrega una sola vez.
- Validación Zod, límite de cuerpo, Problem Details sin trazas y redacción de logs.
- Configuración de producción que falla cerrada ante modo demo, cookie insegura, secreto de ejemplo, base no PostgreSQL, CORS HTTP o proxy no confiable.
- Contenedor no-root, `read_only`, `cap_drop: ALL`, healthcheck y dependencias fijadas.
