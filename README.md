# Backend — AgroShield API

[![CI](https://github.com/Zatrynox/agroshield-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Zatrynox/agroshield-backend/actions/workflows/ci.yml)

API HTTP de AgroShield. Node.js + TypeScript estricto, Fastify 5, Zod, PostgreSQL, migraciones SQL versionadas, Problem Details, OpenAPI y separación DDD/CQRS por contexto.

> Estado: `0.1.0` funcional para demo. No hay `learning`, `community` ni `billing`; no se presentan como operativos.

> **Repositorio independiente.** Este código se extrae del monorepo [`Zatrynox/agroshield`](https://github.com/Zatrynox/agroshield), que sigue siendo la fuente de verdad. Aquí se incluyen las piezas necesarias para compilar, probar y ejecutar la API por separado. El sitio público y el panel viven en [`agroshield-landing`](https://github.com/Zatrynox/agroshield-landing) y [`agroshield-frontend`](https://github.com/Zatrynox/agroshield-frontend).

## Stack

- Node.js `>= 22` (probado con `24.15.0`), ESM.
- Fastify 5 + `fastify-type-provider-zod`.
- PostgreSQL 17 en producción; `pg` como driver.
- PGlite para pruebas y desarrollo local con semántica PostgreSQL.
- `@node-rs/argon2` (Argon2id) para contraseñas.
- Ed25519 nativo de Node para claves de sensor.
- Vitest para dominio, integración y contrato OpenAPI.

## Estructura

```text
.
├── migrations/
│   ├── 0001_core.sql
│   └── 0002_captcha_uses.sql
├── src/
│   ├── alerts/               alertas, reglas, acknowledge
│   ├── analytics/            eventos de landing consentidos
│   ├── config/               validación de entorno
│   ├── farms/                fincas y zonas
│   ├── forecast/             tendencia demo por zona
│   ├── iam/                  registro, login, sesión, CSRF, captcha
│   ├── leads/                solicitudes de demo
│   ├── organizations/        organización actual y miembros
│   ├── predictions/          predicción demo por zona
│   ├── sensors/              sensores, claves y lecturas firmadas
│   ├── shared/               buses, DB, HTTP, errores, auth, cookies
│   ├── soil-health/          salud del suelo y recomendación
│   ├── test/                 app de pruebas y suites
│   └── tools/                migrate, seed y simulador
├── .dependency-cruiser.cjs
├── eslint.config.js
├── tsconfig.build.json
└── vitest.config.ts
```

Cada contexto implementado sigue la misma separación:

```text
<contexto>/
├── domain/          entidades, value objects, reglas y repositorios (interfaces)
├── application/     comandos, consultas y handlers
├── infrastructure/  persistencia PostgreSQL y criptografía
└── interfaces/http/ rutas Fastify y esquemas Zod
```

Los buses de comandos, consultas y eventos viven en `src/shared/application/`. Son en memoria; sustituirlos por Redis/NATS no requiere cambiar los handlers.

## Puesta en marcha

Desde la raíz de este repositorio:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm migrate
pnpm seed
pnpm dev
```

La API escucha en `http://localhost:3000`. `AUTO_MIGRATE=true` aplica migraciones al arrancar; en producción se usa el servicio `migrate` y `AUTO_MIGRATE=false`.

### PGlite en el host

`DATABASE_URL=pglite://.data/pglite` abre una base local en `.data/pglite`. PGlite no está pensado para varios procesos escribiendo a la vez: si ejecutas `seed` mientras la API está arrancada, reinicia la API después para que vea los cambios. Para trabajo con varios procesos usa el stack Docker con PostgreSQL o apunta `DATABASE_URL` a un PostgreSQL real.

### Seed y simulador

```bash
pnpm seed
pnpm simulate
```

- El seed exige `DEMO_MODE=true`, `NODE_ENV!=production` y `DEMO_PASSWORD` de al menos 12 caracteres.
- Elimina y recrea la organización `agroshield-demo`. **No usar sobre datos reales.**
- Crea 1 finca, 3 zonas, 3 sensores, lecturas históricas y alertas abiertas.
- Guarda claves privadas de demo en `.data/demo-keys/` (ignorado por git).
- El simulador firma lecturas con esas claves y las envía a la API.

## API

Prefijo versionado `/v1`. La documentación interactiva está en `/docs` y el JSON OpenAPI en `/documentation/json` cuando `ENABLE_API_DOCS=true` (por defecto en desarrollo; desactivada en producción).

### Sistema

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Liveness + comprobación de base de datos |

### Autenticación y sesión

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/v1/auth/register` | Crea usuario, organización y sesión |
| POST | `/v1/auth/login` | Inicia sesión; cookie HttpOnly + CSRF |
| POST | `/v1/auth/logout` | Revoca la sesión |
| GET | `/v1/auth/me` | Usuario, organización y rol actuales |
| GET | `/v1/auth/session-status` | `{ authenticated: boolean }`, sin datos sensibles |
| GET | `/v1/captcha` | Reto de prueba de trabajo para la demo |

### Organizaciones, fincas y zonas

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/v1/organizations/current` | Organización actual |
| PATCH | `/v1/organizations/current` | Actualiza nombre (roles de escritura) |
| GET | `/v1/farms` | Fincas de la organización |
| POST | `/v1/farms` | Crea finca |
| GET | `/v1/farms/:farmId` | Detalle con zonas |
| GET | `/v1/farms/:farmId/zones` | Zonas de la finca |
| POST | `/v1/farms/:farmId/zones` | Crea zona |
| GET | `/v1/zones/:zoneId` | Detalle de zona |

### Sensores y lecturas

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/v1/zones/:zoneId/sensors` | Sensores de la zona |
| POST | `/v1/zones/:zoneId/sensors` | Inscribe sensor; devuelve clave privada una vez |
| GET | `/v1/zones/:zoneId/readings?limit=24` | Últimas lecturas |
| POST | `/v1/sensors/:sensorId/readings` | Ingesta firmada por el dispositivo |
| POST | `/v1/sensors/:sensorId/rotate-key` | Rota la clave y revoca la anterior |
| DELETE | `/v1/sensors/:sensorId` | Revoca el sensor |

### Alertas, suelo, pronóstico y predicción

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/v1/alerts?zoneId=` | Alertas abiertas |
| GET | `/v1/alerts/:alertId` | Detalle |
| POST | `/v1/alerts/:alertId/acknowledge` | Reconoce y persiste |
| GET | `/v1/zones/:zoneId/soil-health` | Puntuación, factor limitante, días y recomendación |
| GET | `/v1/zones/:zoneId/forecast` | Tendencia demo a 7 días |
| GET | `/v1/zones/:zoneId/prediction` | Predicción demo de riesgo |

### Landing

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/v1/leads` | Solicitud de demo con honeypot, captcha y consentimiento |
| POST | `/v1/analytics/events` | Evento de analítica solo con consentimiento |

## Autenticación y CSRF

- Contraseñas con Argon2id. Cinco fallos consecutivos bloquean la cuenta 15 minutos.
- Sesión opaca: se guarda un hash SHA-256 del token, nunca el token en claro.
- Cookie `agroshield_session`: `HttpOnly`, `SameSite=Lax`, `Secure` en producción, `Path=/`.
- Las mutaciones autenticadas requieren `x-csrf-token`, devuelto por login/registro y validado contra la sesión.
- `GET /v1/auth/me` y `GET /v1/auth/session-status` permiten restaurar la sesión sin exponer el token.
- RBAC: `owner`, `admin`, `agronomist`, `operator`, `viewer`. Las rutas de escritura usan `WRITE_ROLES`.
- Toda consulta de datos se filtra por `organization_id` de la sesión.

Ejemplo de login y mutación:

```bash
curl -i -c cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"demo@agroshield.example","password":"..."}' \
  http://localhost:3000/v1/auth/login

curl -b cookies.txt -H "x-csrf-token: <token>" \
  -X POST http://localhost:3000/v1/alerts/<id>/acknowledge
```

## Lecturas firmadas

Payload canónico (`agroshield-readings-v1`), independiente del orden de propiedades JSON:

```text
agroshield-readings-v1|<sensorId>|<x-sensor-timestamp>|<clientReadingId>|<recordedAt>|<soilTempC>|<moisturePct>|<ph>|<nitrogenMgKg>|<phosphorusMgKg>|<potassiumMgKg>|<conductivityMsCm>|<pestIndex>
```

La firma Ed25519 se envía en `x-sensor-signature` (base64) junto a `x-sensor-timestamp`. La API:

1. Comprueba que el sensor pertenece a una zona de la organización y está activo.
2. Verifica la firma con la clave pública y la ventana `SENSOR_MAX_SKEW_SECONDS` (300 s por defecto).
3. Deduplica por `clientReadingId` o `Idempotency-Key`.
4. Persiste la lectura y evalúa reglas de alerta y salud del suelo.

La clave privada se devuelve **una sola vez** al inscribir o rotar. El servidor solo almacena la clave pública.

## Reglas de dominio

- **Temperatura:** umbral por cultivo (maíz 34 °C, trigo/tomate 30 °C, lechuga 26 °C, olivo 36 °C, vid 34 °C, soja 32 °C, otro 32 °C). El tiempo hasta pérdida decae exponencialmente con el exceso; severidad crítica desde +5 °C.
- **Plaga:** si el índice es ≥ 20 y la serie reciente crece, estima crecimiento exponencial `ln(P2/P1)/días` y días hasta el umbral crítico. Si no hay serie suficiente y el índice es ≥ 55, usa una estimación conservadora.
- **Nutrientes:** compara N/P/K con objetivos `40/20/150 mg/kg`; el factor limitante define días restantes y severidad.
- **Salud del suelo:** puntuación ponderada humedad 30 %, pH 20 %, nutrientes 30 %, plaga 20 %; estados `healthy`, `watch`, `depleted`; recomendación basada en el factor más débil.
- **Alertas:** `dedupe_key` por zona/tipo/ventana; `acknowledged_at` persiste el reconocimiento y las elimina de la cola abierta.

## Base de datos y migraciones

```bash
pnpm migrate
```

`src/shared/db/migrations.ts` crea `schema_migrations`, lee `migrations/*.sql` en orden y aplica cada archivo en una transacción. Las migraciones incluyen organizaciones, usuarios, memberships, sesiones, fincas, zonas, sensores, claves, lecturas, alertas, leads, eventos y usos de captcha.

Producción:

- `AUTO_MIGRATE=false`.
- El servicio `migrate` de Compose ejecuta `node dist/tools/migrate.js` antes del backend.
- `DATABASE_URL` debe empezar por `postgresql://` o `postgres://`.
- No se permite PGlite ni SQLite en producción (validación de configuración).

## Configuración

Variables principales (ver `.env.example` y `src/config/env.ts`):

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | `development`, `test`, `production` |
| `APP_ENV` | Entorno lógico de la aplicación |
| `DEMO_MODE` | Activa seed/simulador; prohibido en producción |
| `API_HOST`, `API_PORT` | Bind de Fastify |
| `DATABASE_URL` | `postgresql://...` o `pglite://...` |
| `AUTO_MIGRATE` | Migraciones al arrancar (solo desarrollo) |
| `SESSION_SECRET` | ≥ 32 caracteres; rechaza placeholders en producción |
| `SESSION_TTL_HOURS` | Duración de sesión (1–720 h) |
| `COOKIE_SECURE` | Debe ser `true` en producción |
| `CORS_ORIGINS` | Lista explícita; HTTPS obligatorio en producción |
| `CAPTCHA_DIFFICULTY` | Dificultad de la prueba de trabajo (3–6) |
| `LEAD_RATE_LIMIT_PER_HOUR` | Límite de solicitudes de demo |
| `SENSOR_MAX_SKEW_SECONDS` | Ventana de reloj para firmas |
| `TRUST_PROXY` | Debe ser `true` en producción |
| `ENABLE_API_DOCS` | Swagger UI/OpenAPI; `false` en producción |
| `DEMO_PASSWORD` | Solo seed local |
| `DEMO_SENSOR_KEY_DIR` | Directorio de claves de demo |

En producción el backend falla al arrancar si detecta modo demo, cookie insegura, secreto de ejemplo, base no PostgreSQL, CORS HTTP o proxy no confiable.

## Pruebas

```bash
pnpm test
pnpm typecheck
pnpm lint
```

- Dominio: reglas de alertas, salud del suelo, pronóstico, predicción y payload firmado.
- Integración: flujo completo de registro/login/sesión/CSRF, fincas, zonas, sensores, lecturas, alertas, leads y analítica sobre PGlite.
- Contrato: OpenAPI serializa, rutas y parámetros esperados.
- Cobertura actual: **41 pruebas**.

## OpenAPI

Con `ENABLE_API_DOCS=true`:

- UI: `http://localhost:3000/docs`
- JSON: `http://localhost:3000/documentation/json`
- A través de Caddy local: `http://localhost:8080/docs` y `/documentation/json`

Los esquemas de ruta usan `transform: jsonSchemaTransform`; sin esa transformación, los esquemas Zod de Fastify rompen la generación OpenAPI.

## Producción

El backend se construye con el `Dockerfile` de este repositorio:

- Build multi-stage con Node 24.15.0 Alpine.
- `pnpm deploy --prod --legacy` para el runtime.
- Se eliminan `src`, tests, configs de desarrollo, `.env` y `.data`.
- Usuario no-root `app` (UID 10001), `tini`, healthcheck.
- El contenedor es de solo lectura; solo `/tmp` es tmpfs.

Ver [`SECURITY.md`](SECURITY.md) y el repositorio [`agroshield-infra`](https://github.com/Zatrynox/agroshield-infra).

## Limitaciones

- Sin `learning`, `community` ni `billing`.
- Pronóstico y predicción son demo, no modelos validados.
- Sin scheduler, colas externas ni eventos distribuidos.
- Sin verificación de correo, recuperación de contraseña ni MFA.
- Sin auditoría exportable ni observabilidad centralizada.
- PGlite es solo para pruebas/desarrollo; no soporta la concurrencia de producción.
