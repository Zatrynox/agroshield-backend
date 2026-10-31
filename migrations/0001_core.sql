CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name varchar(160) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  plan varchar(32) NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  email_normalized varchar(320) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL CHECK (role IN ('owner', 'admin', 'agronomist', 'operator', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  user_agent varchar(300),
  ip_hash char(64)
);

CREATE INDEX sessions_active_lookup ON sessions (token_hash) WHERE revoked_at IS NULL;

CREATE TABLE farms (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  location varchar(200) NOT NULL DEFAULT '',
  area_hectares numeric(12, 2) NOT NULL DEFAULT 0 CHECK (area_hectares >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX farms_org ON farms (organization_id, created_at DESC);

CREATE TABLE zones (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  crop_type varchar(80) NOT NULL,
  area_hectares numeric(12, 2) NOT NULL DEFAULT 0 CHECK (area_hectares >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX zones_farm_name ON zones (farm_id, lower(name));
CREATE INDEX zones_org ON zones (organization_id);

CREATE TABLE sensors (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  public_key_pem text NOT NULL,
  fingerprint char(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_seen_at timestamptz
);

CREATE INDEX sensors_zone ON sensors (zone_id);

CREATE TABLE sensor_readings (
  id uuid PRIMARY KEY,
  sensor_id uuid NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  client_reading_id varchar(100) NOT NULL,
  recorded_at timestamptz NOT NULL,
  soil_temp_c numeric(5, 2) NOT NULL CHECK (soil_temp_c BETWEEN -20 AND 100),
  moisture_pct numeric(5, 2) NOT NULL CHECK (moisture_pct BETWEEN 0 AND 100),
  ph numeric(4, 2) NOT NULL CHECK (ph BETWEEN 0 AND 14),
  nitrogen_mg_kg numeric(8, 2) NOT NULL CHECK (nitrogen_mg_kg >= 0),
  phosphorus_mg_kg numeric(8, 2) NOT NULL CHECK (phosphorus_mg_kg >= 0),
  potassium_mg_kg numeric(8, 2) NOT NULL CHECK (potassium_mg_kg >= 0),
  conductivity_ms_cm numeric(6, 2) NOT NULL CHECK (conductivity_ms_cm >= 0),
  pest_index numeric(5, 2) NOT NULL CHECK (pest_index BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sensor_id, client_reading_id)
);

CREATE INDEX readings_zone_time ON sensor_readings (zone_id, recorded_at DESC);
CREATE INDEX readings_org_time ON sensor_readings (organization_id, recorded_at DESC);

CREATE TABLE alerts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  type varchar(32) NOT NULL CHECK (type IN ('temperature', 'pest', 'nutrients')),
  severity varchar(16) NOT NULL CHECK (severity IN ('warning', 'critical')),
  title varchar(200) NOT NULL,
  message text NOT NULL,
  deadline_at timestamptz NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key varchar(220) NOT NULL UNIQUE,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alerts_org_active ON alerts (organization_id, created_at DESC);
CREATE INDEX alerts_zone ON alerts (zone_id, created_at DESC);

CREATE TABLE leads (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  email varchar(320) NOT NULL,
  company varchar(160) NOT NULL,
  phone varchar(40) NOT NULL DEFAULT '',
  message text NOT NULL,
  source varchar(40) NOT NULL DEFAULT 'landing',
  consent boolean NOT NULL,
  ip_hash char(64),
  user_agent varchar(300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_created ON leads (created_at DESC);

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY,
  name varchar(60) NOT NULL,
  path varchar(300) NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_created ON analytics_events (created_at DESC);
