-- Itens extras (bebidas e lembranças) vendidos junto com um pedido.
-- Cada linha = um item do catálogo com a quantidade comprada.
-- O total do pedido (orders.total) já inclui o valor dos extras;
-- esta tabela guarda o detalhamento item a item para relatórios.

create table if not exists public.order_extras (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_extras_order_id_idx on public.order_extras (order_id);

-- RLS no mesmo padrão de orders/order_items: só INSERT liberado para o
-- role public (o app insere com a anon key). Leituras seguem o mesmo
-- modelo das outras tabelas (sem policy de select para o public).
alter table public.order_extras enable row level security;

create policy "order_extras_insert"
  on public.order_extras
  for insert
  with check (true);
