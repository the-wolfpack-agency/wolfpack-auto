-- 028_document_vault.sql — Deal / lead / vehicle document storage with e-signature tracking.

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  dealer_id UUID NOT NULL,
  deal_id TEXT,
  lead_id UUID,
  vehicle_vin TEXT,
  doc_type TEXT CHECK (doc_type IN ('purchase_agreement','title','registration','insurance','disclosure','credit_app','trade_title','lien_release','inspection','other')),
  name TEXT NOT NULL,
  file_url TEXT,
  file_size_bytes INTEGER,
  mime_type TEXT,
  uploaded_by TEXT,
  signed BOOLEAN DEFAULT false,
  signed_at TIMESTAMPTZ,
  signature_data TEXT,             -- base64 e-signature if applicable
  notes TEXT,
  tags TEXT[],
  deleted_at TIMESTAMPTZ,          -- soft-delete
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_deal ON documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_documents_lead ON documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_documents_vin ON documents(vehicle_vin);
CREATE INDEX IF NOT EXISTS idx_documents_dealer ON documents(dealer_id);
