-- Review management: aggregated reviews from Google, Yelp, Facebook, etc.
CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     TEXT NOT NULL REFERENCES dealers(id),
  platform      TEXT NOT NULL CHECK (platform IN ('google','yelp','facebook','cars_com','edmunds','dealerrater','other')),
  external_id   TEXT,  -- platform-specific review ID
  reviewer_name TEXT NOT NULL,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text   TEXT,
  sentiment     TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  response_text TEXT,
  responded_at  TIMESTAMPTZ,
  responded_by  TEXT,
  flagged       BOOLEAN DEFAULT false,
  published_at  TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dealer_id, platform, external_id)
);

CREATE INDEX idx_reviews_dealer ON reviews(dealer_id);
CREATE INDEX idx_reviews_platform ON reviews(dealer_id, platform);
CREATE INDEX idx_reviews_rating ON reviews(dealer_id, rating);

CREATE TABLE IF NOT EXISTS review_response_templates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   TEXT NOT NULL REFERENCES dealers(id),
  name        TEXT NOT NULL,
  tone        TEXT NOT NULL CHECK (tone IN ('positive','neutral','recovery')),
  body        TEXT NOT NULL,
  variables   TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
