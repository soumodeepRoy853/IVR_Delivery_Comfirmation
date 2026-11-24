CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE delivery_status AS ENUM (
    'not_called', 'calling', 'received', 'not_received', 'no_answer_failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE call_outcome AS ENUM (
    'pending', 'received', 'not_received', 'no_answer_failed', 'no_input', 'invalid_input'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone_e164    TEXT NOT NULL,
  product       TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  status        delivery_status NOT NULL DEFAULT 'not_called',
  last_call_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_phone_e164_check CHECK (phone_e164 ~ '^\+91[6-9][0-9]{9}$')
);

CREATE TABLE IF NOT EXISTS call_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id      UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  provider_call_id TEXT NOT NULL UNIQUE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,
  outcome          call_outcome NOT NULL DEFAULT 'pending',
  raw_input        TEXT,
  provider_status  TEXT,
  raw_payload      JSONB,
  recording_url    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries (status);
CREATE INDEX IF NOT EXISTS deliveries_last_call_idx ON deliveries (last_call_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_delivery_idx ON call_logs (delivery_id, started_at DESC);
