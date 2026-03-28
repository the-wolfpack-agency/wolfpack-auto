-- Add missing dealer_id indexes to tables created in migrations 021-025
-- These tables were created without indexes, causing full table scans

CREATE INDEX IF NOT EXISTS idx_deal_worksheets_dealer ON deal_worksheets(dealer_id);
CREATE INDEX IF NOT EXISTS idx_fi_product_catalog_dealer ON fi_product_catalog(dealer_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_dealer ON service_appointments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_dealer ON repair_orders(dealer_id);
CREATE INDEX IF NOT EXISTS idx_parts_inventory_dealer ON parts_inventory(dealer_id);
CREATE INDEX IF NOT EXISTS idx_technicians_dealer ON technicians(dealer_id);
CREATE INDEX IF NOT EXISTS idx_service_history_dealer ON service_history(dealer_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_dealer ON message_templates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_dealer ON follow_up_sequences(dealer_id);
CREATE INDEX IF NOT EXISTS idx_message_log_dealer ON message_log(dealer_id);
CREATE INDEX IF NOT EXISTS idx_sales_log_dealer ON sales_log(dealer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_dealer ON commissions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_dealer ON reviews(dealer_id);
CREATE INDEX IF NOT EXISTS idx_review_response_templates_dealer ON review_response_templates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_dealer ON audit_logs(dealer_id);
