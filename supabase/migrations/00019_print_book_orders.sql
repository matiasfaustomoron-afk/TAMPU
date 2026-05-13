-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Print book orders (modelo Polarsteps / Peecho)
--
-- Cada user puede pedir un libro físico de su viaje. La orden vive en
-- 'draft' hasta que confirma el pago, después pasa a 'submitted' (enviada
-- a Peecho), después 'printed', 'shipped', 'delivered'.
--
-- Snapshot inmutable del viaje al momento del request → el libro NO cambia
-- si el user después modifica el trip.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists print_book_orders (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,

  -- Configuración del libro
  binding text not null default 'hardcover' check (binding in ('softcover', 'hardcover', 'lay-flat-premium')),
  title text not null,
  cover_photo_id uuid,

  -- Estimaciones
  estimated_price_eur numeric(10,2) not null,
  estimated_pages integer not null,

  -- Pricing real una vez confirmado
  final_price_eur numeric(10,2),
  currency text default 'EUR',

  -- Estado del pedido
  status text not null default 'draft' check (status in (
    'draft',           -- creado, sin pagar
    'pending_payment', -- esperando confirmación de pago
    'paid',            -- pagado, generando PDF
    'submitted',       -- mandado a Peecho
    'printed',         -- impreso por Peecho
    'shipped',         -- enviado por courier
    'delivered',       -- entregado
    'cancelled',       -- cancelado
    'refunded'         -- refunded
  )),

  -- Peecho integration
  peecho_order_id text,
  pdf_url text,             -- URL del PDF generado (Supabase Storage)
  tracking_number text,
  shipping_address jsonb,

  -- Snapshot inmutable
  snapshot jsonb not null,

  created_at timestamptz default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz default now()
);

create index idx_print_book_orders_user on print_book_orders(user_id);
create index idx_print_book_orders_trip on print_book_orders(trip_id);
create index idx_print_book_orders_status on print_book_orders(status);

-- RLS: cada user solo ve sus propias órdenes
alter table print_book_orders enable row level security;

drop policy if exists print_book_orders_own_select on print_book_orders;
create policy print_book_orders_own_select on print_book_orders for select using (auth.uid() = user_id);

drop policy if exists print_book_orders_own_modify on print_book_orders;
create policy print_book_orders_own_modify on print_book_orders for all using (auth.uid() = user_id);
