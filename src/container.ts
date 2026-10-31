import { systemClock } from './shared/clock.js';
import { CommandBus } from './shared/kernel/command-bus.js';
import { QueryBus } from './shared/kernel/query-bus.js';
import { EventBus } from './shared/kernel/event-bus.js';
import type { AppConfig } from './config/env.js';
import type { Db } from './shared/db/db.js';
import { PgUserRepository } from './iam/infrastructure/persistence/pg-user-repository.js';
import { PgSessionRepository } from './iam/infrastructure/persistence/pg-session-repository.js';
import { Argon2PasswordHasher } from './iam/infrastructure/crypto/argon2-password-hasher.js';
import { SessionService } from './iam/application/services/session-service.js';
import { RegisterCommand, RegisterHandler } from './iam/application/commands/register.js';
import { LoginCommand, LoginHandler } from './iam/application/commands/login.js';
import { LogoutCommand, LogoutHandler } from './iam/application/commands/logout.js';
import { GetMeHandler, GetMeQuery } from './iam/application/queries/get-me.js';
import {
  SessionStatusHandler,
  SessionStatusQuery,
} from './iam/application/queries/session-status.js';
import {
  PgMembershipRepository,
  PgOrganizationRepository,
} from './organizations/infrastructure/persistence/pg-organization-repository.js';
import {
  GetOrganizationHandler,
  GetOrganizationQuery,
  RenameOrganizationCommand,
  RenameOrganizationHandler,
} from './organizations/application/organization-use-cases.js';
import { PgFarmRepository, PgZoneRepository } from './farms/infrastructure/persistence/pg-farm-repository.js';
import {
  CreateFarmCommand,
  CreateFarmHandler,
  CreateZoneCommand,
  CreateZoneHandler,
  GetFarmHandler,
  GetFarmQuery,
  GetZoneHandler,
  GetZoneQuery,
  ListFarmsHandler,
  ListFarmsQuery,
} from './farms/application/farm-use-cases.js';
import { Ed25519SensorKeyService } from './sensors/infrastructure/crypto/ed25519-sensor-key-service.js';
import {
  PgReadingRepository,
  PgSensorRepository,
} from './sensors/infrastructure/persistence/pg-sensor-repository.js';
import {
  CreateSensorCommand,
  CreateSensorHandler,
  IngestReadingCommand,
  IngestReadingHandler,
  ListReadingsHandler,
  ListReadingsQuery,
  ListSensorsHandler,
  ListSensorsQuery,
  RevokeSensorCommand,
  RevokeSensorHandler,
  RotateSensorKeyCommand,
  RotateSensorKeyHandler,
} from './sensors/application/sensor-use-cases.js';
import { PgAlertRepository } from './alerts/infrastructure/persistence/pg-alert-repository.js';
import {
  AcknowledgeAlertCommand,
  AcknowledgeAlertHandler,
  GetAlertHandler,
  GetAlertQuery,
  ListAlertsHandler,
  ListAlertsQuery,
} from './alerts/application/alert-use-cases.js';
import { EvaluateAlertsOnReading } from './alerts/application/event-handlers/evaluate-alerts-on-reading.js';
import {
  GetSoilHealthHandler,
  GetSoilHealthQuery,
} from './soil-health/application/get-soil-health.js';
import { GetForecastHandler, GetForecastQuery } from './forecast/application/get-forecast.js';
import {
  GetPredictionHandler,
  GetPredictionQuery,
} from './predictions/application/get-prediction.js';
import { PgLeadRepository } from './leads/infrastructure/persistence/pg-lead-repository.js';
import { PgCaptchaUseRepository } from './leads/infrastructure/persistence/pg-captcha-use-repository.js';
import { CaptchaService } from './leads/application/captcha-service.js';
import { CreateLeadCommand, CreateLeadHandler } from './leads/application/create-lead.js';
import { PgAnalyticsRepository } from './analytics/infrastructure/persistence/pg-analytics-repository.js';
import {
  RecordAnalyticsEventCommand,
  RecordAnalyticsEventHandler,
} from './analytics/application/record-event.js';

export interface AppContainer {
  config: AppConfig;
  db: Db;
  commandBus: CommandBus;
  queryBus: QueryBus;
  eventBus: EventBus;
  sessions: SessionService;
  captcha: CaptchaService;
}

export function createContainer(config: AppConfig, db: Db): AppContainer {
  const clock = systemClock;
  const commandBus = new CommandBus();
  const queryBus = new QueryBus();
  const eventBus = new EventBus();

  const users = new PgUserRepository(db);
  const sessions = new PgSessionRepository(db);
  const organizations = new PgOrganizationRepository(db);
  const memberships = new PgMembershipRepository(db);
  const farms = new PgFarmRepository(db);
  const zones = new PgZoneRepository(db);
  const sensors = new PgSensorRepository(db);
  const readings = new PgReadingRepository(db);
  const alerts = new PgAlertRepository(db);
  const leads = new PgLeadRepository(db);
  const captchaUses = new PgCaptchaUseRepository(db);
  const analytics = new PgAnalyticsRepository(db);

  const hasher = new Argon2PasswordHasher();
  const keyService = new Ed25519SensorKeyService();
  const sessionService = new SessionService(sessions, users, organizations, memberships, config, clock);
  const captcha = new CaptchaService(config.sessionSecret, config.captchaDifficulty, clock);

  commandBus.register(
    RegisterCommand,
    new RegisterHandler(users, organizations, memberships, hasher, sessionService, clock),
  );
  commandBus.register(
    LoginCommand,
    new LoginHandler(users, organizations, memberships, hasher, sessionService, clock),
  );
  commandBus.register(LogoutCommand, new LogoutHandler(sessions, () => clock.now()));

  queryBus.register(GetMeQuery, new GetMeHandler());
  queryBus.register(SessionStatusQuery, new SessionStatusHandler(sessionService));
  queryBus.register(GetOrganizationQuery, new GetOrganizationHandler(organizations, memberships));
  commandBus.register(
    RenameOrganizationCommand,
    new RenameOrganizationHandler(organizations, memberships),
  );

  commandBus.register(CreateFarmCommand, new CreateFarmHandler(farms, clock));
  commandBus.register(CreateZoneCommand, new CreateZoneHandler(farms, zones, clock));
  queryBus.register(ListFarmsQuery, new ListFarmsHandler(farms));
  queryBus.register(GetFarmQuery, new GetFarmHandler(farms, zones));
  queryBus.register(GetZoneQuery, new GetZoneHandler(farms, zones));

  commandBus.register(
    CreateSensorCommand,
    new CreateSensorHandler(sensors, zones, keyService, clock),
  );
  commandBus.register(
    RotateSensorKeyCommand,
    new RotateSensorKeyHandler(sensors, keyService),
  );
  commandBus.register(RevokeSensorCommand, new RevokeSensorHandler(sensors, clock));
  queryBus.register(ListSensorsQuery, new ListSensorsHandler(sensors, zones));
  queryBus.register(ListReadingsQuery, new ListReadingsHandler(readings, zones));
  commandBus.register(
    IngestReadingCommand,
    new IngestReadingHandler(sensors, readings, zones, keyService, eventBus, config, clock),
  );

  queryBus.register(ListAlertsQuery, new ListAlertsHandler(alerts, zones, clock));
  queryBus.register(GetAlertQuery, new GetAlertHandler(alerts, clock));
  commandBus.register(AcknowledgeAlertCommand, new AcknowledgeAlertHandler(alerts, clock));
  eventBus.subscribe(
    'sensors.reading.received',
    new EvaluateAlertsOnReading(readings, alerts, eventBus, clock),
  );

  queryBus.register(
    GetSoilHealthQuery,
    new GetSoilHealthHandler(zones, readings, clock),
  );
  queryBus.register(GetForecastQuery, new GetForecastHandler(zones, readings, clock));
  queryBus.register(GetPredictionQuery, new GetPredictionHandler(zones, readings, alerts));

  commandBus.register(CreateLeadCommand, new CreateLeadHandler(leads, captcha, captchaUses, clock));
  commandBus.register(
    RecordAnalyticsEventCommand,
    new RecordAnalyticsEventHandler(analytics, clock),
  );

  return {
    config,
    db,
    commandBus,
    queryBus,
    eventBus,
    sessions: sessionService,
    captcha,
  };
}
