CREATE TABLE captcha_uses (
  challenge_hash char(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX captcha_uses_expiry ON captcha_uses (expires_at);
