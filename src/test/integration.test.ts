import { createHash, createPrivateKey, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalReadingPayload } from '../sensors/domain/services/reading-payload.js';
import type { ReadingInput } from '../sensors/domain/model/sensor-reading.js';
import { cookieFrom, createTestContext, registerUser, type TestContext } from './support/test-app.js';

interface Session {
  cookie: string;
  csrfToken: string;
  farmId?: string;
  zoneId?: string;
  sensorId?: string;
  privateKeyPem?: string;
}

function readingBody(id: string, overrides: Partial<ReadingInput> = {}): Omit<ReadingInput, 'clientReadingId'> & { clientReadingId?: string } {
  return {
    recordedAt: new Date().toISOString(),
    soilTempC: 42,
    moisturePct: 44,
    ph: 6.8,
    nitrogenMgKg: 6,
    phosphorusMgKg: 24,
    potassiumMgKg: 160,
    conductivityMsCm: 1.2,
    pestIndex: 82,
    ...overrides,
    clientReadingId: id,
  };
}

function signReading(
  privateKeyPem: string,
  sensorId: string,
  timestamp: string,
  body: ReadingInput,
): string {
  const payload = canonicalReadingPayload(sensorId, timestamp, body);
  const key = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(payload), key).toString('base64');
}

function solveCaptcha(challenge: string, difficulty: number): string {
  const prefix = '0'.repeat(difficulty);
  for (let attempt = 0; attempt < 2_000_000; attempt += 1) {
    const solution = attempt.toString(16);
    const digest = createHash('sha256').update(`${challenge}:${solution}`).digest('hex');
    if (digest.startsWith(prefix)) {
      return solution;
    }
  }
  throw new Error('Could not solve the test captcha');
}

describe('AgroShield API integration (real PostgreSQL via PGlite)', () => {
  let ctx: TestContext;
  let session: Session;
  let second: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('serves a health check backed by the database', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('registers an account with an owner membership and a secure session', async () => {
    const registered = await registerUser(ctx.app, {
      email: 'ana@example.test',
      organizationName: 'Agro Norte',
    });
    session = registered;
    expect(registered.cookie).toMatch(/^agroshield_session=/);

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: session.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { email: 'ana@example.test' },
      organization: { name: 'Agro Norte' },
      role: 'owner',
    });
    expect(me.json().csrfToken).toBe(session.csrfToken);
  });

  it('rejects duplicate email registration and weak passwords', async () => {
    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'ana@example.test',
        password: 'Prueba-Segura-2026!',
        name: 'Otra Ana',
        organizationName: 'Agro Sur',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('email_taken');

    const weak = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'weak@example.test',
        password: 'short',
        name: 'Poca Clave',
        organizationName: 'Agro Sur',
      },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.headers['content-type']).toContain('application/problem+json');
  });

  it('requires CSRF for authenticated mutations', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/farms',
      headers: { cookie: session.cookie },
      payload: { name: 'Predio Norte', location: 'Córdoba', areaHectares: 120 },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('csrf_invalid');
  });

  it('creates a farm, a zone, a sensor and derives alerts from a signed reading', async () => {
    const farm = await ctx.app.inject({
      method: 'POST',
      url: '/v1/farms',
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
      payload: { name: 'Predio Norte', location: 'Córdoba, Argentina', areaHectares: 120 },
    });
    expect(farm.statusCode).toBe(201);
    session.farmId = farm.json().id;

    const zone = await ctx.app.inject({
      method: 'POST',
      url: `/v1/farms/${session.farmId}/zones`,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
      payload: { name: 'Lote 4', cropType: 'maíz', areaHectares: 30 },
    });
    expect(zone.statusCode).toBe(201);
    session.zoneId = zone.json().id;

    const sensor = await ctx.app.inject({
      method: 'POST',
      url: `/v1/zones/${session.zoneId}/sensors`,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
      payload: { name: 'Sonda 4A' },
    });
    expect(sensor.statusCode).toBe(201);
    expect(sensor.json().privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(sensor.json().sensor.keyVersion).toBe(1);
    session.sensorId = sensor.json().sensor.id;
    session.privateKeyPem = sensor.json().privateKeyPem;

    const id = 'reading-integration-1';
    const body = readingBody(id) as ReadingInput;
    const timestamp = new Date().toISOString();
    const signature = signReading(session.privateKeyPem!, session.sensorId!, timestamp, body);

    const ingest = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sensors/${session.sensorId}/readings`,
      headers: {
        'x-sensor-timestamp': timestamp,
        'x-sensor-signature': signature,
        'idempotency-key': id,
      },
      payload: body,
    });
    expect(ingest.statusCode).toBe(202);
    expect(ingest.json().duplicate).toBe(false);
    const readingId = ingest.json().readingId;

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sensors/${session.sensorId}/readings`,
      headers: {
        'x-sensor-timestamp': timestamp,
        'x-sensor-signature': signature,
        'idempotency-key': id,
      },
      payload: body,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);
    expect(duplicate.json().readingId).toBe(readingId);

    const alerts = await ctx.app.inject({
      method: 'GET',
      url: '/v1/alerts',
      headers: { cookie: session.cookie },
    });
    expect(alerts.statusCode).toBe(200);
    const alertRows = alerts.json();
    expect(alertRows.length).toBeGreaterThanOrEqual(3);
    expect(alertRows.map((alert: { type: string }) => alert.type)).toEqual(
      expect.arrayContaining(['temperature', 'pest', 'nutrients']),
    );
    expect(alertRows[0].deadlineAt).toBeTruthy();

    const health = await ctx.app.inject({
      method: 'GET',
      url: `/v1/zones/${session.zoneId}/soil-health`,
      headers: { cookie: session.cookie },
    });
    expect(health.statusCode).toBe(200);
    expect(health.json().assessment.status).toBeDefined();
    expect(health.json().assessment.score).toBeLessThan(60);

    const forecast = await ctx.app.inject({
      method: 'GET',
      url: `/v1/zones/${session.zoneId}/forecast`,
      headers: { cookie: session.cookie },
    });
    expect(forecast.statusCode).toBe(200);
    expect(forecast.json().demo).toBe(true);

    const prediction = await ctx.app.inject({
      method: 'GET',
      url: `/v1/zones/${session.zoneId}/prediction`,
      headers: { cookie: session.cookie },
    });
    expect(prediction.statusCode).toBe(200);
    expect(prediction.json().risk).toBe('high');
    expect(prediction.json().incidentZone).toBe(true);

    const critical = alertRows.find(
      (alert: { type: string; severity: string }) => alert.type === 'pest',
    );
    const acknowledged = await ctx.app.inject({
      method: 'POST',
      url: `/v1/alerts/${critical.id}/acknowledge`,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().acknowledgedAt).toBeTruthy();

    const revoke = await ctx.app.inject({
      method: 'DELETE',
      url: `/v1/sensors/${session.sensorId}`,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().status).toBe('revoked');

    const afterRevoke = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sensors/${session.sensorId}/readings`,
      headers: { 'x-sensor-timestamp': timestamp, 'x-sensor-signature': signature },
      payload: body,
    });
    expect(afterRevoke.statusCode).toBe(401);
    expect(afterRevoke.json().code).toBe('sensor_revoked');
  });

  it('rejects forged sensor signatures and stale timestamps', async () => {
    const sensor = await ctx.app.inject({
      method: 'POST',
      url: `/v1/zones/${session.zoneId}/sensors`,
      headers: { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
      payload: { name: 'Sonda falsa' },
    });
    expect(sensor.statusCode).toBe(201);
    const sensorId = sensor.json().sensor.id;
    const body = readingBody('forged-reading') as ReadingInput;
    const timestamp = new Date().toISOString();

    const forged = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sensors/${sensorId}/readings`,
      headers: {
        'x-sensor-timestamp': timestamp,
        'x-sensor-signature': Buffer.from('not-a-signature').toString('base64'),
        'idempotency-key': body.clientReadingId,
      },
      payload: body,
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json().code).toBe('sensor_unauthorized');

    const staleTimestamp = new Date(Date.now() - 3_600_000).toISOString();
    const staleSignature = signReading(
      sensor.json().privateKeyPem,
      sensorId,
      staleTimestamp,
      body,
    );
    const stale = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sensors/${sensorId}/readings`,
      headers: {
        'x-sensor-timestamp': staleTimestamp,
        'x-sensor-signature': staleSignature,
        'idempotency-key': body.clientReadingId,
      },
      payload: body,
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json().code).toBe('sensor_clock_skew');
  });

  it('isolates organizations on every tenant route (IDOR)', async () => {
    const other = await registerUser(ctx.app, {
      email: 'bruno@example.test',
      organizationName: 'Agro Sur',
    });
    second = other;

    const farms = await ctx.app.inject({
      method: 'GET',
      url: '/v1/farms',
      headers: { cookie: second.cookie },
    });
    expect(farms.statusCode).toBe(200);
    expect(farms.json()).toEqual([]);

    for (const url of [
      `/v1/farms/${session.farmId}`,
      `/v1/zones/${session.zoneId}`,
      `/v1/zones/${session.zoneId}/sensors`,
      `/v1/zones/${session.zoneId}/readings`,
      `/v1/zones/${session.zoneId}/soil-health`,
      `/v1/zones/${session.zoneId}/forecast`,
      `/v1/zones/${session.zoneId}/prediction`,
    ]) {
      const response = await ctx.app.inject({
        method: 'GET',
        url,
        headers: { cookie: second.cookie },
      });
      expect(response.statusCode, url).toBe(404);
    }

    const ownZone = await ctx.app.inject({
      method: 'POST',
      url: `/v1/farms/${session.farmId}/zones`,
      headers: { cookie: second.cookie, 'x-csrf-token': second.csrfToken },
      payload: { name: 'Intruso', cropType: 'soja', areaHectares: 10 },
    });
    expect(ownZone.statusCode).toBe(404);
  });

  it('rejects hostile origins on mutations', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'ana@example.test', password: 'Prueba-Segura-2026!' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('logs in, reports session status, and logs out with revocation', async () => {
    const anonymous = await ctx.app.inject({ method: 'GET', url: '/v1/auth/session-status' });
    expect(anonymous.json()).toEqual({ authenticated: false });

    const authenticated = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/session-status',
      headers: { cookie: second.cookie },
    });
    expect(authenticated.json()).toEqual({ authenticated: true });

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'http://localhost:4321' },
      payload: { email: 'bruno@example.test', password: 'Prueba-Segura-2026!' },
    });
    expect(login.statusCode).toBe(200);
    const freshCookie = cookieFrom(login);
    expect(freshCookie).not.toBe(second.cookie);

    const badLogin = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'bruno@example.test', password: 'Incorrecta-2026!' },
    });
    expect(badLogin.statusCode).toBe(401);
    expect(badLogin.json().code).toBe('invalid_credentials');

    const freshCsrf = login.json().csrfToken;
    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: freshCookie, 'x-csrf-token': freshCsrf },
    });
    expect(logout.statusCode).toBe(204);

    const after = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: freshCookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('validates the lead form with a server-verified proof of work', async () => {
    const challengeResponse = await ctx.app.inject({ method: 'GET', url: '/v1/captcha' });
    expect(challengeResponse.statusCode).toBe(200);
    const captcha = challengeResponse.json();

    const solution = solveCaptcha(captcha.challenge, captcha.difficulty);
    const lead = await ctx.app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        name: 'Carla Compradora',
        email: 'carla@example.test',
        company: 'Agro Cooperativa',
        phone: '+34 600 000 000',
        message: 'Queremos una demo para 12 explotaciones y conocer el plan anual.',
        consent: true,
        website: '',
        captchaChallenge: captcha.challenge,
        captchaSolution: solution,
      },
    });
    expect(lead.statusCode).toBe(201);
    expect(lead.json().id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await ctx.db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM leads',
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);

    const badCaptcha = await ctx.app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        name: 'Bot',
        email: 'bot@example.test',
        company: 'Bots SL',
        message: 'Este mensaje intenta colarse sin resolver el desafío.',
        consent: true,
        website: '',
        captchaChallenge: captcha.challenge,
        captchaSolution: 'incorrecta',
      },
    });
    expect(badCaptcha.statusCode).toBe(400);
    expect(badCaptcha.json().code).toBe('captcha_invalid');

    const honeypot = await ctx.app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        name: 'Bot',
        email: 'bot@example.test',
        company: 'Bots SL',
        message: 'Este mensaje intenta colarse usando el campo trampa.',
        consent: true,
        website: 'https://spam.example',
        captchaChallenge: captcha.challenge,
        captchaSolution: solution,
      },
    });
    expect(honeypot.statusCode).toBe(400);
    expect(honeypot.json().code).toBe('validation_error');

    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        name: 'Carla Compradora',
        email: 'carla@example.test',
        company: 'Agro Cooperativa',
        message: 'Este segundo envío reutiliza un desafío ya consumido.',
        consent: true,
        website: '',
        captchaChallenge: captcha.challenge,
        captchaSolution: solution,
      },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe('captcha_invalid');
  });

  it('records analytics only with explicit consent', async () => {
    const denied = await ctx.app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      payload: { name: 'page_view', path: '/', props: {}, consent: false },
    });
    expect(denied.statusCode).toBe(400);

    const accepted = await ctx.app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      payload: { name: 'page_view', path: '/', props: {}, consent: true },
    });
    expect(accepted.statusCode).toBe(204);

    const rows = await ctx.db.query<{ count: string | number }>(
      'SELECT COUNT(*)::int AS count FROM analytics_events',
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });

  it('returns Problem Details for unknown routes and validation errors', async () => {
    const missing = await ctx.app.inject({ method: 'GET', url: '/v1/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['content-type']).toContain('application/problem+json');
    expect(missing.json()).toMatchObject({ status: 404, code: 'not_found' });

    const invalid = await ctx.app.inject({
      method: 'GET',
      url: `/v1/farms/not-a-uuid`,
      headers: { cookie: session.cookie },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe('validation_error');
  });
});
