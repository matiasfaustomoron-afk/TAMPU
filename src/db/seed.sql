-- ═══════════════════════════════════════════
-- TRAVEL OS — SEED DATA
-- ═══════════════════════════════════════════
-- Run AFTER schema.sql. Replace USER_ID with your auth.users id.
-- This is for dev/demo bootstrap ONLY. Not part of runtime.

-- Set your user ID here:
\set uid '''YOUR_USER_ID_HERE'''

-- ─── TRIP ───
INSERT INTO trips (id, user_id, name, description, destination, status, start_date, end_date, base_currency, total_budget, contingency_percent, contingency_amount, alert_days_warning, alert_days_critical, budget_warning_threshold, budget_danger_threshold, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  :uid,
  'Seúl + Papúa Nueva Guinea 2026',
  'Viaje cultural: Goroka Show con Wander Expeditions + 11 noches en Seúl. Ruta: EZE→GRU→DXB→MNL→POM→Tour PNG→POM→MNL→ICN→Seúl→ICN→DXB→GRU→EZE',
  'Seoul, South Korea & Papua New Guinea',
  'planning',
  '2026-08-10',
  '2026-09-02',
  'USD',
  7500,
  10,
  750,
  7,
  3,
  80,
  95,
  true
);

-- ─── CITIES ───
INSERT INTO cities (trip_id, name, country, arrival_date, departure_date, nights, order_index, notes) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'São Paulo (GRU)', 'Brazil', '2026-08-10', '2026-08-10', 0, 0, 'Transit only'),
('550e8400-e29b-41d4-a716-446655440001', 'Dubai (DXB)', 'UAE', '2026-08-11', '2026-08-11', 0, 1, 'Transit only'),
('550e8400-e29b-41d4-a716-446655440001', 'Manila (MNL)', 'Philippines', '2026-08-11', '2026-08-12', 1, 2, 'Transit connection'),
('550e8400-e29b-41d4-a716-446655440001', 'Port Moresby (POM)', 'Papua New Guinea', '2026-08-12', '2026-08-14', 2, 3, 'Pre-tour staging'),
('550e8400-e29b-41d4-a716-446655440001', 'PNG Highlands', 'Papua New Guinea', '2026-08-14', '2026-08-20', 6, 4, 'Wander Expeditions PNG III Tour'),
('550e8400-e29b-41d4-a716-446655440001', 'Port Moresby (POM)', 'Papua New Guinea', '2026-08-20', '2026-08-21', 1, 5, 'Post-tour'),
('550e8400-e29b-41d4-a716-446655440001', 'Manila (MNL)', 'Philippines', '2026-08-21', '2026-08-22', 1, 6, 'Transit to ICN'),
('550e8400-e29b-41d4-a716-446655440001', 'Seoul (ICN)', 'South Korea', '2026-08-22', '2026-09-02', 11, 7, 'Jongno district Airbnb');

-- ─── BUDGET CATEGORIES ───
INSERT INTO budget_categories (trip_id, category, label, budgeted_amount, order_index) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'flights', 'Flights', 2500, 0),
('550e8400-e29b-41d4-a716-446655440001', 'accommodation', 'Accommodation', 900, 1),
('550e8400-e29b-41d4-a716-446655440001', 'food', 'Food', 800, 2),
('550e8400-e29b-41d4-a716-446655440001', 'transport', 'Internal Transport', 300, 3),
('550e8400-e29b-41d4-a716-446655440001', 'activities', 'Activities & Tours', 3700, 4),
('550e8400-e29b-41d4-a716-446655440001', 'insurance', 'Insurance', 250, 5),
('550e8400-e29b-41d4-a716-446655440001', 'connectivity', 'Connectivity', 60, 6),
('550e8400-e29b-41d4-a716-446655440001', 'shopping', 'Shopping', 200, 7),
('550e8400-e29b-41d4-a716-446655440001', 'photography', 'Photography/Tech', 100, 8),
('550e8400-e29b-41d4-a716-446655440001', 'fees', 'Fees & Exchange', 150, 9),
('550e8400-e29b-41d4-a716-446655440001', 'contingency', 'Contingency', 750, 10),
('550e8400-e29b-41d4-a716-446655440001', 'other', 'Other', 100, 11);

-- ─── RESERVATIONS ───
INSERT INTO reservations (trip_id, type, criticality, provider, city_name, description, purchase_date, use_date, use_end_date, original_amount, original_currency, exchange_rate, base_amount, status, confirmation_received, locator, cancellation_policy, is_cancellable, notes) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'flight', 'blocker', 'Emirates', 'GRU→DXB→MNL + ICN→DXB→GRU', 'Emirates NM6XKS. Turista Flex.', '2026-04-01', '2026-08-09', '2026-09-03', 9940, 'BRL', 5.16, 1927, 'confirmed', true, 'NM6XKS', 'Flex fare', true, 'Paid with Black card'),
('550e8400-e29b-41d4-a716-446655440001', 'flight', 'blocker', 'PAL + Air Niugini', 'MNL↔POM', 'Booking 1124-604-505. PAL PR215 + Air Niugini PX10.', '2026-04-01', '2026-08-12', '2026-08-21', 734710, 'ARS', 1200, 612, 'confirmed', true, '1124-604-505', 'Flex', true, NULL),
('550e8400-e29b-41d4-a716-446655440001', 'flight', 'blocker', 'Pending', 'BUE↔GRU', 'Buenos Aires to São Paulo. Book with points.', NULL, '2026-08-09', '2026-09-03', 0, 'ARS', 1, 0, 'pending', false, NULL, NULL, true, 'Priority purchase'),
('550e8400-e29b-41d4-a716-446655440001', 'flight', 'blocker', 'Pending', 'MNL→ICN', 'Manila to Seoul ~Aug 22.', NULL, '2026-08-22', NULL, 0, 'USD', 1, 0, 'pending', false, NULL, NULL, true, 'Estimated USD 200-350'),
('550e8400-e29b-41d4-a716-446655440001', 'tour', 'blocker', 'Wander Expeditions', 'PNG Highlands', 'PNG III Tour - Goroka Show. Aug 14-20.', '2026-01-15', '2026-08-14', '2026-08-20', 3450, 'EUR', 0.926, 3726, 'confirmed', true, NULL, 'Zero refund within 90 days', false, 'EUR 3,450'),
('550e8400-e29b-41d4-a716-446655440001', 'accommodation', 'essential', 'Airbnb', 'Seoul', 'Jongno district 11 nights.', '2026-03-15', '2026-08-22', '2026-09-02', 0, 'USD', 1, 0, 'confirmed', true, NULL, 'requires_validation', true, 'AC needs verification'),
('550e8400-e29b-41d4-a716-446655440001', 'insurance', 'blocker', 'Pending', 'All destinations', 'Travel insurance with medevac GOP for PNG.', NULL, '2026-08-10', '2026-09-02', 0, 'USD', 1, 0, 'pending', false, NULL, NULL, true, 'IATI Mochilero or Heymondo TOP');

-- ─── EXPENSES ───
INSERT INTO expenses (trip_id, date, category, subcategory, description, payment_method, original_currency, original_amount, exchange_rate, base_amount, is_fixed, is_budgeted) VALUES
('550e8400-e29b-41d4-a716-446655440001', '2026-04-01', 'flights', 'international', 'Emirates GRU→DXB→MNL + ICN→DXB→GRU', 'credit_card_black', 'BRL', 9940, 5.16, 1927, true, true),
('550e8400-e29b-41d4-a716-446655440001', '2026-04-01', 'flights', 'regional', 'PAL MNL→POM + Air Niugini POM→MNL', 'credit_card_other', 'ARS', 734710, 1200, 612, true, true),
('550e8400-e29b-41d4-a716-446655440001', '2026-01-15', 'activities', 'tour', 'Wander Expeditions PNG III', 'bank_transfer', 'EUR', 3450, 0.926, 3726, true, true);

-- Note: Full 72 tasks, 13 documents, 35+ packing items are loaded via
-- the TypeScript seed in src/lib/config/seed-data.ts for demo mode.
-- For production Supabase, run a separate task/doc/packing insert script
-- or import from the seed-data.ts programmatically.
