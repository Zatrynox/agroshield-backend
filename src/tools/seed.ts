import { randomUUID, createPrivateKey, sign } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../config/env.js';
import { createDb } from '../shared/db/db.js';
import { runMigrations } from '../shared/db/migrations.js';
import { createContainer } from '../container.js';
import { Argon2PasswordHasher } from '../iam/infrastructure/crypto/argon2-password-hasher.js';
import { PgUserRepository } from '../iam/infrastructure/persistence/pg-user-repository.js';
import {
  PgMembershipRepository,
  PgOrganizationRepository,
} from '../organizations/infrastructure/persistence/pg-organization-repository.js';
import { Membership, Organization } from '../organizations/domain/model/organization.js';
import { User } from '../iam/domain/model/user.js';
import { PgFarmRepository, PgZoneRepository } from '../farms/infrastructure/persistence/pg-farm-repository.js';
import { Farm, Zone } from '../farms/domain/model/farm.js';
import { PgSensorRepository, PgReadingRepository } from '../sensors/infrastructure/persistence/pg-sensor-repository.js';
import { Sensor } from '../sensors/domain/model/sensor.js';
import { SensorReading, type ReadingInput } from '../sensors/domain/model/sensor-reading.js';
import { Ed25519SensorKeyService } from '../sensors/infrastructure/crypto/ed25519-sensor-key-service.js';
import { canonicalReadingPayload } from '../sensors/domain/services/reading-payload.js';
import { IngestReadingCommand } from '../sensors/application/sensor-use-cases.js';

const DEMO_ORG_SLUG = 'agroshield-demo';
const DEMO_EMAIL = 'demo@agroshield.example';
const HOUR = 3_600_000;

interface DemoKeyFile {
  sensorId: string;
  sensorName: string;
  zoneId: string;
  zoneName: string;
  privateKeyPem: string;
}

function assertDemoMode(): string {
  const config = loadConfig();
  if (!config.demoMode || config.nodeEnv === 'production') {
    throw new Error(
      'Refusing to seed: this tool is demo-only. Set DEMO_MODE=true and NODE_ENV != production.',
    );
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('DEMO_PASSWORD with at least 12 characters is required to seed.');
  }
  return password;
}

async function main(): Promise<void> {
  const password = assertDemoMode();
  const config = loadConfig();
  const db = await createDb(config.databaseUrl);
  await runMigrations(db);

  const users = new PgUserRepository(db);
  const organizations = new PgOrganizationRepository(db);
  const memberships = new PgMembershipRepository(db);
  const farms = new PgFarmRepository(db);
  const zones = new PgZoneRepository(db);
  const sensors = new PgSensorRepository(db);
  const readings = new PgReadingRepository(db);
  const keyService = new Ed25519SensorKeyService();
  const hasher = new Argon2PasswordHasher();
  const container = createContainer(config, db);
  const now = new Date();

  const previousOrg = await organizations.findBySlug(DEMO_ORG_SLUG);
  if (previousOrg) {
    await organizations.deleteById(previousOrg.id);
  }
  const previousUser = await users.findByEmail(DEMO_EMAIL);
  if (previousUser) {
    await users.deleteById(previousUser.id);
  }

  const organization = Organization.create({
    id: randomUUID(),
    name: 'AgroShield Demo',
    slug: DEMO_ORG_SLUG,
    plan: 'demo',
    createdAt: now,
  });
  await organizations.create(organization);

  const user = User.register({
    id: randomUUID(),
    email: DEMO_EMAIL,
    name: 'Equipo Demo',
    passwordHash: await hasher.hash(password),
    createdAt: now,
  });
  await users.insert(user);
  await memberships.add(
    Membership.create({
      userId: user.id,
      organizationId: organization.id,
      role: 'owner',
      createdAt: now,
    }),
  );

  const farm = Farm.create({
    id: randomUUID(),
    organizationId: organization.id,
    name: 'Finca El Vedado',
    location: 'Valle del Guadalquivir, Sevilla',
    areaHectares: 184,
    createdAt: now,
  });
  await farms.create(farm);

  const zoneDefinitions = [
    {
      name: 'Lote Norte',
      cropType: 'maíz',
      areaHectares: 62,
      sensorName: 'Sonda Norte · 4A',
      profile: 'stress' as const,
    },
    {
      name: 'Lote Sur',
      cropType: 'tomate',
      areaHectares: 38,
      sensorName: 'Sonda Sur · 2B',
      profile: 'watch' as const,
    },
    {
      name: 'Olivar de secano',
      cropType: 'olivo',
      areaHectares: 84,
      sensorName: 'Sonda Olivar · 1C',
      profile: 'healthy' as const,
    },
  ];

  const keyFile: DemoKeyFile[] = [];

  for (const definition of zoneDefinitions) {
    const zone = Zone.create({
      id: randomUUID(),
      farmId: farm.id,
      organizationId: organization.id,
      name: definition.name,
      cropType: definition.cropType,
      areaHectares: definition.areaHectares,
      createdAt: now,
    });
    await zones.create(zone);

    const pair = keyService.generate();
    const sensor = Sensor.register({
      id: randomUUID(),
      organizationId: organization.id,
      zoneId: zone.id,
      name: definition.sensorName,
      publicKeyPem: pair.publicKeyPem,
      fingerprint: pair.fingerprint,
      createdAt: now,
    });
    await sensors.create(sensor);

    const history = buildHistory(definition.profile, now, sensor, zone);
    for (const oldReading of history.slice(0, -1)) {
      await readings.insertIfAbsent(oldReading);
    }

    const latest = history[history.length - 1]!;
    const signatureTimestamp = new Date().toISOString();
    const payload = canonicalReadingPayload(
      sensor.id,
      signatureTimestamp,
      toReadingInput(latest),
    );
    const signature = sign(
      null,
      Buffer.from(payload, 'utf8'),
      createPrivateKey(pair.privateKeyPem),
    ).toString('base64');

    await container.commandBus.execute(
      new IngestReadingCommand(sensor.id, signatureTimestamp, signature, toReadingInput(latest)),
    );

    keyFile.push({
      sensorId: sensor.id,
      sensorName: sensor.name,
      zoneId: zone.id,
      zoneName: zone.name,
      privateKeyPem: pair.privateKeyPem,
    });
  }

  const keyDirectory = resolve(process.env.DEMO_SENSOR_KEY_DIR ?? './.data/demo-keys');
  await mkdir(keyDirectory, { recursive: true });
  const keyFilePath = resolve(keyDirectory, 'sensors.json');
  await writeFile(
    keyFilePath,
    JSON.stringify({ generatedAt: now.toISOString(), sensors: keyFile }, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  );

  const openAlerts = await db.query<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM alerts WHERE organization_id = $1 AND acknowledged_at IS NULL`,
    [organization.id],
  );

  console.info('Demo data ready');
  console.info(`  Email: ${DEMO_EMAIL}`);
  console.info('  Password: value of DEMO_PASSWORD in your .env');
  console.info(`  Organization: ${organization.name} (${organization.slug})`);
  console.info(`  Farms: 1 · Zones: ${zoneDefinitions.length} · Sensors: ${keyFile.length}`);
  console.info(`  Open alerts: ${Number(openAlerts.rows[0]?.count ?? 0)}`);
  console.info(`  Sensor keys for the simulator: ${keyFilePath}`);
  console.info('  These keys are local demo credentials and are ignored by git.');

  await db.close();
}

function buildHistory(
  profile: 'stress' | 'watch' | 'healthy',
  now: Date,
  sensor: Sensor,
  zone: Zone,
): SensorReading[] {
  const points: Array<{
    agoHours: number;
    soilTempC: number;
    moisturePct: number;
    ph: number;
    nitrogenMgKg: number;
    phosphorusMgKg: number;
    potassiumMgKg: number;
    pestIndex: number;
  }> = [];

  const count = 12;
  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const agoHours = (count - 1 - index) * 6;
    let point = {
      agoHours,
      soilTempC: 23 + progress * 2,
      moisturePct: 48 - progress * 3,
      ph: 6.7,
      nitrogenMgKg: 52 - progress * 4,
      phosphorusMgKg: 28 - progress * 2,
      potassiumMgKg: 180 - progress * 10,
      pestIndex: 8 + progress * 4,
    };

    if (profile === 'watch') {
      point = {
        ...point,
        soilTempC: 27 + progress * 4,
        moisturePct: 42 - progress * 2,
        pestIndex: 14 + progress * 8,
      };
    }
    if (profile === 'stress') {
      point = {
        ...point,
        soilTempC: 30 + progress * 11,
        moisturePct: 40 - progress * 9,
        nitrogenMgKg: 30 - progress * 20,
        phosphorusMgKg: 18 - progress * 6,
        potassiumMgKg: 150 - progress * 40,
        pestIndex: 18 + progress * 60,
      };
    }
    points.push(point);
  }

  return points.map((point, index) => {
    const recordedAt = new Date(now.getTime() - point.agoHours * HOUR);
    const input: ReadingInput = {
      clientReadingId: `demo-${sensor.id}-${String(index).padStart(2, '0')}`,
      recordedAt: recordedAt.toISOString(),
      soilTempC: round(point.soilTempC),
      moisturePct: round(point.moisturePct),
      ph: point.ph,
      nitrogenMgKg: round(point.nitrogenMgKg),
      phosphorusMgKg: round(point.phosphorusMgKg),
      potassiumMgKg: round(point.potassiumMgKg),
      conductivityMsCm: 1.2,
      pestIndex: round(point.pestIndex),
    };
    return SensorReading.create({
      id: randomUUID(),
      sensorId: sensor.id,
      organizationId: sensor.organizationId,
      zoneId: zone.id,
      reading: input,
      createdAt: recordedAt,
    });
  });
}

function toReadingInput(reading: SensorReading): ReadingInput {
  return {
    clientReadingId: reading.clientReadingId,
    recordedAt: reading.recordedAt.toISOString(),
    soilTempC: reading.soilTempC,
    moisturePct: reading.moisturePct,
    ph: reading.ph,
    nitrogenMgKg: reading.nitrogenMgKg,
    phosphorusMgKg: reading.phosphorusMgKg,
    potassiumMgKg: reading.potassiumMgKg,
    conductivityMsCm: reading.conductivityMsCm,
    pestIndex: reading.pestIndex,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
