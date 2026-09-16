-- Leitura dos pedidos restrita ao admin autenticado (Supabase Auth).
-- O app do kiosk (role anon) continua só inserindo; quem está logado no
-- painel admin (role authenticated) passa a conseguir ler os pedidos —
-- sem isso o dashboard sempre voltava vazio (RLS sem policy de SELECT).

create policy "orders_select_admin"
  on public.orders
  for select
  to authenticated
  using (true);

create policy "order_items_select_admin"
  on public.order_items
  for select
  to authenticated
  using (true);

create policy "order_extras_select_admin"
  on public.order_extras
  for select
  to authenticated
  using (true);
