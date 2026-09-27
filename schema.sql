-- SME Cash Stress Test — D1 schema
-- Apply with: wrangler d1 execute sme-cash-stress-test --file=./schema.sql

CREATE TABLE IF NOT EXISTS leads (
  id                  TEXT PRIMARY KEY,
  first_name          TEXT NOT NULL,
  email               TEXT NOT NULL,
  revenue_band        TEXT NOT NULL,
  consent             INTEGER NOT NULL DEFAULT 0,
  utm_source          TEXT DEFAULT '',
  utm_medium          TEXT DEFAULT '',
  utm_campaign        TEXT DEFAULT '',
  page_url            TEXT DEFAULT '',
  referrer            TEXT DEFAULT '',
  score_cash          INTEGER NOT NULL,
  score_debtors       INTEGER NOT NULL,
  score_profitability INTEGER NOT NULL,
  score_inventory     INTEGER NOT NULL,
  score_debt          INTEGER NOT NULL,
  score_total         INTEGER NOT NULL,
  category_key        TEXT NOT NULL,
  waitlisted          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at);

CREATE TABLE IF NOT EXISTS quiz_responses (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT NOT NULL REFERENCES leads (id),
  answers_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_lead_id ON quiz_responses (lead_id);
