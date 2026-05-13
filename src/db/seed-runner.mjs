#!/usr/bin/env node
/**
 * Travel OS — Seed Runner
 * 
 * Inserts all seed data (trip, tasks, reservations, documents, packing, expenses, 
 * budget categories, trip days) into Supabase for a given user.
 *
 * Usage:
 *   SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx USER_ID=xxx node src/db/seed-runner.mjs
 *
 * Note: Uses the SERVICE_ROLE key (not anon) to bypass RLS for seeding.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role key
const USER_ID = process.env.USER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
  console.error("Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, USER_ID");
  process.exit(1);
}

const TRIP_ID = "550e8400-e29b-41d4-a716-446655440001";

async function supabaseInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to insert into ${table}: ${res.status} ${txt}`);
  }
  console.log(`  ✓ ${table}: ${Array.isArray(rows) ? rows.length : 1} rows`);
}

async function seed() {
  console.log("Seeding Travel OS...\n");

  // Trip
  await supabaseInsert("trips", {
    id: TRIP_ID, user_id: USER_ID,
    name: "Seúl + Papúa Nueva Guinea 2026",
    description: "Viaje cultural: Goroka Show + 11 noches en Seúl",
    destination: "Seoul, South Korea & Papua New Guinea",
    status: "planning", start_date: "2026-08-10", end_date: "2026-09-02",
    base_currency: "USD", total_budget: 7500, contingency_percent: 10, contingency_amount: 750,
    alert_days_warning: 7, alert_days_critical: 3, budget_warning_threshold: 80, budget_danger_threshold: 95,
    is_active: true,
  });

  // Cities
  await supabaseInsert("cities", [
    { trip_id: TRIP_ID, name: "São Paulo (GRU)", country: "Brazil", arrival_date: "2026-08-10", departure_date: "2026-08-10", nights: 0, order_index: 0 },
    { trip_id: TRIP_ID, name: "Dubai (DXB)", country: "UAE", arrival_date: "2026-08-11", departure_date: "2026-08-11", nights: 0, order_index: 1 },
    { trip_id: TRIP_ID, name: "Manila (MNL)", country: "Philippines", arrival_date: "2026-08-11", departure_date: "2026-08-12", nights: 1, order_index: 2 },
    { trip_id: TRIP_ID, name: "Port Moresby (POM)", country: "Papua New Guinea", arrival_date: "2026-08-12", departure_date: "2026-08-14", nights: 2, order_index: 3 },
    { trip_id: TRIP_ID, name: "PNG Highlands", country: "Papua New Guinea", arrival_date: "2026-08-14", departure_date: "2026-08-20", nights: 6, order_index: 4 },
    { trip_id: TRIP_ID, name: "Port Moresby (POM)", country: "Papua New Guinea", arrival_date: "2026-08-20", departure_date: "2026-08-21", nights: 1, order_index: 5 },
    { trip_id: TRIP_ID, name: "Manila (MNL)", country: "Philippines", arrival_date: "2026-08-21", departure_date: "2026-08-22", nights: 1, order_index: 6 },
    { trip_id: TRIP_ID, name: "Seoul (ICN)", country: "South Korea", arrival_date: "2026-08-22", departure_date: "2026-09-02", nights: 11, order_index: 7 },
  ]);

  // Budget categories
  await supabaseInsert("budget_categories", [
    { trip_id: TRIP_ID, category: "flights", label: "Flights", budgeted_amount: 2500, order_index: 0 },
    { trip_id: TRIP_ID, category: "accommodation", label: "Accommodation", budgeted_amount: 900, order_index: 1 },
    { trip_id: TRIP_ID, category: "food", label: "Food", budgeted_amount: 800, order_index: 2 },
    { trip_id: TRIP_ID, category: "transport", label: "Internal Transport", budgeted_amount: 300, order_index: 3 },
    { trip_id: TRIP_ID, category: "activities", label: "Activities & Tours", budgeted_amount: 3700, order_index: 4 },
    { trip_id: TRIP_ID, category: "insurance", label: "Insurance", budgeted_amount: 250, order_index: 5 },
    { trip_id: TRIP_ID, category: "connectivity", label: "Connectivity", budgeted_amount: 60, order_index: 6 },
    { trip_id: TRIP_ID, category: "shopping", label: "Shopping", budgeted_amount: 200, order_index: 7 },
    { trip_id: TRIP_ID, category: "photography", label: "Photography/Tech", budgeted_amount: 100, order_index: 8 },
    { trip_id: TRIP_ID, category: "fees", label: "Fees & Exchange", budgeted_amount: 150, order_index: 9 },
    { trip_id: TRIP_ID, category: "contingency", label: "Contingency", budgeted_amount: 750, order_index: 10 },
    { trip_id: TRIP_ID, category: "other", label: "Other", budgeted_amount: 100, order_index: 11 },
  ]);

  // Reservations
  await supabaseInsert("reservations", [
    { trip_id: TRIP_ID, type: "flight", criticality: "blocker", provider: "Emirates", city_name: "GRU→DXB→MNL + ICN→DXB→GRU", description: "Emirates NM6XKS. Turista Flex.", purchase_date: "2026-04-01", use_date: "2026-08-09", use_end_date: "2026-09-03", original_amount: 9940, original_currency: "BRL", exchange_rate: 5.16, base_amount: 1927, status: "confirmed", confirmation_received: true, locator: "NM6XKS", cancellation_policy: "Flex fare", is_cancellable: true },
    { trip_id: TRIP_ID, type: "flight", criticality: "blocker", provider: "PAL + Air Niugini", city_name: "MNL↔POM", description: "Booking 1124-604-505. PAL PR215 + PX10.", purchase_date: "2026-04-01", use_date: "2026-08-12", use_end_date: "2026-08-21", original_amount: 734710, original_currency: "ARS", exchange_rate: 1200, base_amount: 612, status: "confirmed", confirmation_received: true, locator: "1124-604-505" },
    { trip_id: TRIP_ID, type: "flight", criticality: "blocker", provider: "Pending", city_name: "BUE↔GRU", description: "Buenos Aires to São Paulo. Book with points.", use_date: "2026-08-09", payment_deadline: "2026-06-15", original_amount: 0, original_currency: "ARS", base_amount: 0, status: "pending" },
    { trip_id: TRIP_ID, type: "flight", criticality: "blocker", provider: "Pending", city_name: "MNL→ICN", description: "Manila to Seoul ~Aug 22.", use_date: "2026-08-22", payment_deadline: "2026-06-30", original_amount: 0, original_currency: "USD", base_amount: 0, status: "pending", notes: "Estimated USD 200-350" },
    { trip_id: TRIP_ID, type: "tour", criticality: "blocker", provider: "Wander Expeditions", city_name: "PNG Highlands", description: "PNG III Tour - Goroka Show. Aug 14-20.", purchase_date: "2026-01-15", use_date: "2026-08-14", use_end_date: "2026-08-20", original_amount: 3450, original_currency: "EUR", exchange_rate: 0.926, base_amount: 3726, status: "confirmed", confirmation_received: true, cancellation_policy: "Zero refund within 90 days", is_cancellable: false },
    { trip_id: TRIP_ID, type: "accommodation", criticality: "essential", provider: "Airbnb", city_name: "Seoul", description: "Jongno district 11 nights.", purchase_date: "2026-03-15", use_date: "2026-08-22", use_end_date: "2026-09-02", original_amount: 0, original_currency: "USD", base_amount: 0, status: "confirmed", confirmation_received: true, notes: "AC needs verification" },
    { trip_id: TRIP_ID, type: "insurance", criticality: "blocker", provider: "Pending", city_name: "All destinations", description: "Travel insurance with medevac GOP for PNG.", use_date: "2026-08-10", use_end_date: "2026-09-02", payment_deadline: "2026-07-15", original_amount: 0, original_currency: "USD", base_amount: 0, status: "pending", notes: "IATI Mochilero or Heymondo TOP" },
  ]);

  // Expenses
  await supabaseInsert("expenses", [
    { trip_id: TRIP_ID, date: "2026-04-01", category: "flights", subcategory: "international", description: "Emirates GRU→DXB→MNL + ICN→DXB→GRU", payment_method: "credit_card_black", original_currency: "BRL", original_amount: 9940, exchange_rate: 5.16, base_amount: 1927, is_fixed: true, is_budgeted: true },
    { trip_id: TRIP_ID, date: "2026-04-01", category: "flights", subcategory: "regional", description: "PAL MNL→POM + Air Niugini POM→MNL", payment_method: "credit_card_other", original_currency: "ARS", original_amount: 734710, exchange_rate: 1200, base_amount: 612, is_fixed: true, is_budgeted: true },
    { trip_id: TRIP_ID, date: "2026-01-15", category: "activities", subcategory: "tour", description: "Wander Expeditions PNG III", payment_method: "bank_transfer", original_currency: "EUR", original_amount: 3450, exchange_rate: 0.926, base_amount: 3726, is_fixed: true, is_budgeted: true },
  ]);

  // Tasks (top 30 — critical/essential ones for seed)
  const taskBase = { trip_id: TRIP_ID, responsible: "Matias", status: "pending", progress: 0, is_blocker: false, requires_payment: false };
  await supabaseInsert("tasks", [
    { ...taskBase, title: "Buy BUE↔GRU tickets with points", category: "flights", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-06-15", next_action: "Check point availability" },
    { ...taskBase, title: "Buy MNL→ICN ticket", category: "flights", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-06-30", requires_payment: true, estimated_amount: 250 },
    { ...taskBase, title: "Research travel insurance options", category: "insurance", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-06-01", status: "in_progress", progress: 50 },
    { ...taskBase, title: "Confirm GOP coverage for PNG in writing", category: "insurance", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-06-15" },
    { ...taskBase, title: "Purchase travel insurance", category: "insurance", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-07-15", requires_payment: true, estimated_amount: 250 },
    { ...taskBase, title: "Check passport validity (6+ months)", category: "documentation", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-05-01" },
    { ...taskBase, title: "Check PNG visa requirements", category: "documentation", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-05-15", city_name: "Port Moresby" },
    { ...taskBase, title: "Check South Korea K-ETA", category: "documentation", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-05-15", city_name: "Seoul" },
    { ...taskBase, title: "Check Philippines transit visa", category: "documentation", priority: "high", criticality: "essential", due_date: "2026-05-15", city_name: "Manila" },
    { ...taskBase, title: "Research PNG vaccinations", category: "health", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-05-01", requires_payment: true, estimated_amount: 100 },
    { ...taskBase, title: "Visit travel medicine clinic", category: "health", priority: "critical", criticality: "blocker", is_blocker: true, due_date: "2026-06-01", requires_payment: true, estimated_amount: 150 },
    { ...taskBase, title: "Buy malaria prophylaxis", category: "health", priority: "critical", criticality: "essential", due_date: "2026-07-15", requires_payment: true, estimated_amount: 50 },
    { ...taskBase, title: "Book Manila transit hotel (night 1)", category: "accommodation", priority: "high", criticality: "essential", due_date: "2026-07-01", city_name: "Manila", requires_payment: true, estimated_amount: 40 },
    { ...taskBase, title: "Book POM accommodation (pre-tour)", category: "accommodation", priority: "high", criticality: "essential", due_date: "2026-07-01", city_name: "Port Moresby", requires_payment: true, estimated_amount: 120 },
    { ...taskBase, title: "Book POM accommodation (post-tour)", category: "accommodation", priority: "high", criticality: "essential", due_date: "2026-07-01", city_name: "Port Moresby", requires_payment: true, estimated_amount: 60 },
    { ...taskBase, title: "Book Manila transit hotel (night 2)", category: "accommodation", priority: "high", criticality: "essential", due_date: "2026-07-01", city_name: "Manila", requires_payment: true, estimated_amount: 40 },
    { ...taskBase, title: "Confirm AC with Seoul Airbnb host", category: "accommodation", priority: "high", criticality: "essential", due_date: "2026-05-15", city_name: "Seoul" },
    { ...taskBase, title: "Get USD cash for trip", category: "finance", priority: "high", criticality: "essential", due_date: "2026-08-05", requires_payment: true, estimated_amount: 500 },
    { ...taskBase, title: "Buy eSIM for South Korea", category: "connectivity", priority: "medium", criticality: "important", due_date: "2026-08-05", requires_payment: true, estimated_amount: 20 },
    { ...taskBase, title: "Download offline maps (PNG + Seoul)", category: "connectivity", priority: "high", criticality: "essential", due_date: "2026-08-08" },
    { ...taskBase, title: "Prepare first aid kit for PNG", category: "health", priority: "high", criticality: "essential", due_date: "2026-08-01", requires_payment: true, estimated_amount: 40 },
    { ...taskBase, title: "Scan and backup all travel documents", category: "documentation", priority: "high", criticality: "essential", due_date: "2026-08-01" },
    { ...taskBase, title: "Notify banks of travel dates", category: "finance", priority: "high", criticality: "essential", due_date: "2026-08-01" },
    { ...taskBase, title: "Review Wander Expeditions briefing", category: "activities", priority: "high", criticality: "essential", due_date: "2026-07-01", city_name: "PNG Highlands" },
    { ...taskBase, title: "Confirm Wander meeting point", category: "logistics", priority: "high", criticality: "essential", due_date: "2026-08-01", city_name: "Port Moresby" },
    { ...taskBase, title: "Request vacation days (Aug 9 - Sep 3)", category: "admin", priority: "critical", criticality: "blocker", status: "done", progress: 100 },
    { ...taskBase, title: "Web check-in Emirates", category: "flights", priority: "high", criticality: "essential", due_date: "2026-08-09", stage: "pre_departure" },
    { ...taskBase, title: "Final packing check", category: "packing", priority: "high", criticality: "essential", due_date: "2026-08-09", stage: "pre_departure" },
    { ...taskBase, title: "Print critical documents", category: "documentation", priority: "high", criticality: "essential", due_date: "2026-08-09", stage: "pre_departure" },
    { ...taskBase, title: "Charge all devices and power banks", category: "packing", priority: "medium", criticality: "essential", due_date: "2026-08-09", stage: "pre_departure" },
  ]);

  // Documents
  await supabaseInsert("documents", [
    { trip_id: TRIP_ID, type: "passport", name: "Argentine Passport", criticality: "blocker", status: "pending", action_required: "Verify 6+ months validity" },
    { trip_id: TRIP_ID, type: "visa", name: "PNG Visa/Entry Permit", criticality: "blocker", status: "pending", action_required: "Research requirements" },
    { trip_id: TRIP_ID, type: "visa", name: "South Korea K-ETA/Visa", criticality: "blocker", status: "pending", action_required: "Research K-ETA eligibility" },
    { trip_id: TRIP_ID, type: "visa", name: "Philippines Entry Requirements", criticality: "essential", status: "pending", action_required: "Check transit visa" },
    { trip_id: TRIP_ID, type: "insurance", name: "Travel Insurance Policy", criticality: "blocker", status: "pending", action_required: "Purchase after GOP confirmation" },
    { trip_id: TRIP_ID, type: "ticket", name: "Emirates Booking NM6XKS", criticality: "blocker", status: "ready", has_digital_copy: true, is_validated: true },
    { trip_id: TRIP_ID, type: "ticket", name: "PAL/Air Niugini 1124-604-505", criticality: "blocker", status: "ready", has_digital_copy: true, is_validated: true },
    { trip_id: TRIP_ID, type: "reservation", name: "Wander Expeditions Confirmation", criticality: "blocker", status: "ready", has_digital_copy: true, is_validated: true },
    { trip_id: TRIP_ID, type: "reservation", name: "Seoul Airbnb Confirmation", criticality: "essential", status: "ready", has_digital_copy: true, is_validated: true },
    { trip_id: TRIP_ID, type: "medical", name: "Vaccination Certificate", criticality: "blocker", status: "pending", action_required: "Visit travel clinic" },
    { trip_id: TRIP_ID, type: "medical", name: "Malaria Prophylaxis Rx", criticality: "essential", status: "pending", action_required: "Get prescription" },
    { trip_id: TRIP_ID, type: "emergency_contact", name: "Emergency Contacts List", criticality: "essential", status: "pending", action_required: "Compile list" },
    { trip_id: TRIP_ID, type: "payment_method", name: "Black Credit Card", criticality: "essential", status: "ready", is_validated: true, action_required: "Notify bank" },
  ]);

  // Packing items
  const packBase = { trip_id: TRIP_ID, status: "pending", quantity_current: 0 };
  await supabaseInsert("packing_items", [
    { ...packBase, category: "clothing", item: "Lightweight t-shirts", quantity_target: 6, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Long-sleeve sun protection shirt", quantity_target: 2, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Convertible hiking pants", quantity_target: 2, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Underwear (quick-dry)", quantity_target: 8, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Socks (hiking + casual)", quantity_target: 6, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Hiking boots", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "clothing", item: "Walking shoes (Seoul)", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Rain jacket (packable)", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "clothing", item: "Light fleece", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "medium" },
    { ...packBase, category: "electronics", item: "Universal power adapter", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "critical", deadline: "2026-07-30" },
    { ...packBase, category: "electronics", item: "Power bank 20000mAh", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "electronics", item: "USB cables + chargers", quantity_target: 3, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "electronics", item: "Phone", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "health", item: "Malaria prophylaxis pills", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "critical", deadline: "2026-07-30" },
    { ...packBase, category: "health", item: "DEET insect repellent", quantity_target: 2, is_essential: true, is_purchased: false, needs_purchase: true, priority: "critical", deadline: "2026-07-30" },
    { ...packBase, category: "health", item: "Sunscreen SPF 50+", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "high", deadline: "2026-07-30" },
    { ...packBase, category: "health", item: "Water purification tablets", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "critical", deadline: "2026-07-30" },
    { ...packBase, category: "health", item: "First aid kit", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "high", deadline: "2026-07-30" },
    { ...packBase, category: "health", item: "Hand sanitizer", quantity_target: 2, is_essential: true, is_purchased: false, needs_purchase: true, priority: "high", deadline: "2026-07-30" },
    { ...packBase, category: "gear", item: "Daypack 25-30L", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "gear", item: "Dry bags", quantity_target: 2, is_essential: true, is_purchased: false, needs_purchase: true, priority: "high", deadline: "2026-07-30" },
    { ...packBase, category: "gear", item: "Headlamp", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "gear", item: "Water bottle", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "photography", item: "Camera body", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "photography", item: "Camera lenses", quantity_target: 2, is_essential: true, is_purchased: true, needs_purchase: false, priority: "high" },
    { ...packBase, category: "photography", item: "Memory cards 64GB+", quantity_target: 4, is_essential: true, is_purchased: false, needs_purchase: true, priority: "high", deadline: "2026-07-30" },
    { ...packBase, category: "photography", item: "Camera rain cover", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "high", deadline: "2026-07-30" },
    { ...packBase, category: "documents", item: "Passport", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "documents", item: "Printed copies of all bookings", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "documents", item: "Credit cards (Black + backup)", quantity_target: 2, is_essential: true, is_purchased: true, needs_purchase: false, priority: "critical" },
    { ...packBase, category: "documents", item: "USD cash", quantity_target: 1, is_essential: true, is_purchased: false, needs_purchase: true, priority: "critical", deadline: "2026-08-05" },
    { ...packBase, category: "toiletries", item: "Toiletry bag (travel size)", quantity_target: 1, is_essential: true, is_purchased: true, needs_purchase: false, priority: "medium" },
  ]);

  // Trip days
  const days = [];
  const start = new Date("2026-08-10");
  const end = new Date("2026-09-02");
  let dayNum = 1;
  const schedule = {
    1: { city: "São Paulo (GRU)", transport: "Emirates GRU→DXB", activity: "Transit", status: "confirmed" },
    2: { city: "Dubai (DXB)", transport: "Emirates DXB→MNL", activity: "Transit", status: "confirmed" },
    3: { city: "Manila (MNL)", accommodation: "pending - airport hotel", activity: "Rest before midnight flight", transport: "PAL PR215 MNL→POM", status: "partial" },
    4: { city: "Port Moresby (POM)", accommodation: "pending - POM hotel", activity: "Arrive POM", status: "partial" },
    5: { city: "Port Moresby (POM)", accommodation: "pending - POM hotel", activity: "Prepare for tour", status: "partial" },
    6: { city: "PNG Highlands", accommodation: "Wander Expeditions", activity: "Tour Day 1", status: "confirmed" },
    7: { city: "PNG Highlands", accommodation: "Homestay - Asaro Mudmen", activity: "Goroka Cultural Show", status: "confirmed" },
    8: { city: "PNG Highlands", accommodation: "Homestay", activity: "Tour", status: "confirmed" },
    9: { city: "PNG Highlands", accommodation: "Homestay - Skeleton Tribe", activity: "Tour", status: "confirmed" },
    10: { city: "PNG Highlands", accommodation: "Homestay - Dust Walkers", activity: "Tour", status: "confirmed" },
    11: { city: "PNG Highlands", accommodation: "Wander Expeditions", activity: "Tour Final Day", status: "confirmed" },
    12: { city: "Port Moresby (POM)", accommodation: "pending - POM hotel", activity: "Post-tour rest", status: "partial" },
    13: { city: "Manila (MNL)", accommodation: "pending - airport hotel", transport: "Air Niugini PX10 POM→MNL", activity: "Transit", status: "partial" },
  };
  const current = new Date(start);
  while (current <= end) {
    const s = schedule[dayNum] || { city: "Seoul", accommodation: dayNum >= 14 ? "Airbnb Jongno" : undefined, zone: dayNum >= 14 ? "Jongno" : undefined, status: dayNum >= 14 ? (dayNum === 24 ? "confirmed" : "empty") : "empty" };
    days.push({
      trip_id: TRIP_ID, date: current.toISOString().split("T")[0], day_number: dayNum,
      city_name: s.city || "Seoul", zone: s.zone || null, accommodation: s.accommodation || null,
      check_in: [3, 4, 6, 12, 13, 14].includes(dayNum), check_out: [3, 5, 11, 12, 13, 24].includes(dayNum),
      main_activity: s.activity || null, main_transport: s.transport || null, status: s.status || "empty",
    });
    current.setDate(current.getDate() + 1);
    dayNum++;
  }
  await supabaseInsert("trip_days", days);

  console.log("\n✅ Seed complete!");
}

seed().catch(err => { console.error("Seed failed:", err); process.exit(1); });
