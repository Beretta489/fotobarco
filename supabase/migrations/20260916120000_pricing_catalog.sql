-- =============================================================================
-- CATALOGO DE PRECOS AUTORITATIVO (server-side)
-- =============================================================================
-- POR QUE ISSO EXISTE:
--   Hoje o preco e calculado no app (PackageSelectScreen / utils/extras.js) e
--   enviado junto com o pedido -- e a policy "orders_insert" aceita qualquer
--   valor (with check = true). Quem controla o tablet controla esse numero:
--   basta interceptar a chamada e mandar total = 0.01 para levar todas as fotos.
--
--   A partir daqui o app NAO envia mais valor nenhum. Ele envia apenas O QUE o
--   cliente escolheu (pacote, ids das fotos, quantidades dos extras) e o
--   servidor recalcula o preco do zero a partir destas tabelas.
--
-- COMO MUDAR PRECOS DEPOIS:
--   Nao mexa no app, nao publique versao nova. Rode um UPDATE nestas tabelas
--   (ou edite pelo painel do Supabase). A proxima venda ja sai com o valor novo.
-- =============================================================================

-- ------------------------------------------------------- precos de pacote --
create table if not exists public.package_pricing (
  package_type  text primary key check (package_type in ('all','half','single')),

  -- Dinheiro SEMPRE em centavos, em inteiro. numeric/float em dinheiro acumula
  -- erro de arredondamento e abre divergencia com o valor cobrado pela
  -- InfinitePay, que tambem trabalha em centavos no deeplink.
  amount_cents  integer not null check (amount_cents >= 0),

  -- 'single' cobra por foto; 'all'/'half' sao valor fixo do pacote.
  is_per_photo  boolean not null default false,
  label         text    not null,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- Valores espelham PackageSelectScreen.js / SelectPhotosScreen.js na data desta
-- migration: all = R$ 100,00 | half = R$ 60,00 | single = R$ 15,00 por foto.
insert into public.package_pricing (package_type, amount_cents, is_per_photo, label) values
  ('all',    10000, false, 'Pacote Completo'),
  ('half',    6000, false, 'Pacote Metade'),
  ('single',  1500, true,  'Fotos Avulsas')
on conflict (package_type) do nothing;

-- ------------------------------------------------------- precos de extras --
-- Espelha utils/extras.js. O arquivo JS continua existindo so para DESENHAR a
-- tela (emoji, categoria, ordem). O valor cobrado vem daqui. Se os dois
-- divergirem, vale esta tabela -- o app nunca decide preco.
create table if not exists public.extras_pricing (
  id           text primary key,          -- mesmo id usado em utils/extras.js
  name         text    not null,
  amount_cents integer not null check (amount_cents >= 0),
  category     text    not null,
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

insert into public.extras_pricing (id, name, amount_cents, category) values
  ('agua-500',                     'Agua 500ml',                    300, 'bebidas'),
  ('coca-lata',                    'Coca lata',                     600, 'bebidas'),
  ('guarana-lata',                 'Guarana lata',                  600, 'bebidas'),
  ('amstel-lata',                  'Cerveja Amstel lata',           600, 'bebidas'),
  ('heineken-lata',                'Cerveja Heineken lata',        1000, 'bebidas'),
  ('brincos-concha',               'Brincos concha',               3500, 'lembrancas'),
  ('porta-caneta-ancora',          'Porta caneta ancora',          3500, 'lembrancas'),
  ('porta-caneta-barco-tartaruga', 'Porta caneta barco/tartaruga', 3500, 'lembrancas'),
  ('porta-caneta-conchas',         'Porta caneta conchas',         3000, 'lembrancas')
on conflict (id) do nothing;

-- Catalogo e informacao publica (o app precisa exibir preco antes de vender),
-- mas somente leitura. Escrita so com service_role / painel.
alter table public.package_pricing enable row level security;
alter table public.extras_pricing  enable row level security;

drop policy if exists package_pricing_select on public.package_pricing;
create policy package_pricing_select on public.package_pricing
  for select to anon, authenticated using (active);

drop policy if exists extras_pricing_select on public.extras_pricing;
create policy extras_pricing_select on public.extras_pricing
  for select to anon, authenticated using (active);


-- =============================================================================
-- FUNCAO DE CALCULO -- unica fonte da verdade sobre quanto cobrar
-- =============================================================================
-- Recebe o que o cliente PEDIU e devolve quanto aquilo custa de verdade.
-- Nao aceita valor nenhum vindo de fora: so ids, quantidades e tipo de pacote.
--
-- Roda como SECURITY DEFINER para ler catalogo e fotos mesmo com RLS ligada.
-- 'set search_path' e obrigatorio em SECURITY DEFINER: sem isso um schema
-- malicioso no search_path do chamador poderia sequestrar as tabelas referidas.
--
-- p_extras: jsonb no formato [{"id":"coca-lata","quantity":2}, ...]
-- =============================================================================
create or replace function public.compute_order_amount_cents(
  p_package_type text,
  p_photo_ids    uuid[],
  p_group_id     uuid,
  p_extras       jsonb default '[]'::jsonb
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pkg          public.package_pricing%rowtype;
  v_photo_count  integer;
  v_valid_photos integer;
  v_group_total  integer;
  v_base_cents   integer;
  v_extras_cents integer := 0;
  v_extra        jsonb;
  v_extra_price  integer;
  v_extra_qty    integer;
  v_extra_id     text;
begin
  select * into v_pkg
    from public.package_pricing
   where package_type = p_package_type and active;

  if not found then
    raise exception 'PACOTE_INVALIDO: %', p_package_type;
  end if;

  v_photo_count := coalesce(array_length(p_photo_ids, 1), 0);
  if v_photo_count = 0 then
    raise exception 'PEDIDO_SEM_FOTOS';
  end if;

  -- Toda foto cobrada precisa existir E pertencer ao grupo do pedido. Sem esta
  -- checagem da para pedir o pacote barato de um grupo e listar as fotos de
  -- outro passeio no mesmo pedido.
  select count(*) into v_valid_photos
    from public.photos
   where id = any(p_photo_ids) and group_id = p_group_id;

  if v_valid_photos <> v_photo_count then
    raise exception 'FOTO_INVALIDA_OU_DE_OUTRO_GRUPO';
  end if;

  select count(*) into v_group_total
    from public.photos where group_id = p_group_id;

  -- Cada pacote tem uma regra de quantidade. Se o cliente mandar mais fotos do
  -- que o pacote permite, o pedido e RECUSADO -- nunca sai mais barato.
  if p_package_type = 'all' then
    if v_photo_count <> v_group_total then
      raise exception 'PACOTE_ALL_EXIGE_TODAS_AS_FOTOS: % de %', v_photo_count, v_group_total;
    end if;
    v_base_cents := v_pkg.amount_cents;

  elsif p_package_type = 'half' then
    if v_photo_count > ceil(v_group_total::numeric / 2) then
      raise exception 'PACOTE_HALF_EXCEDE_LIMITE: % (max %)',
        v_photo_count, ceil(v_group_total::numeric / 2);
    end if;
    v_base_cents := v_pkg.amount_cents;

  else -- single: cobra por foto
    v_base_cents := v_pkg.amount_cents * v_photo_count;
  end if;

  -- ---------------------------------------------------------------- extras --
  for v_extra in select * from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb))
  loop
    v_extra_id  := v_extra->>'id';
    v_extra_qty := coalesce((v_extra->>'quantity')::integer, 0);

    if v_extra_qty <= 0 then
      raise exception 'EXTRA_QUANTIDADE_INVALIDA: %', v_extra_id;
    end if;

    -- Teto por item: impede que um payload absurdo (quantity = 999999) vire
    -- uma cobranca gigante ou estoure o integer no somatorio.
    if v_extra_qty > 99 then
      raise exception 'EXTRA_QUANTIDADE_ACIMA_DO_LIMITE: %', v_extra_id;
    end if;

    select amount_cents into v_extra_price
      from public.extras_pricing
     where id = v_extra_id and active;

    if not found then
      raise exception 'EXTRA_INVALIDO: %', v_extra_id;
    end if;

    v_extras_cents := v_extras_cents + (v_extra_price * v_extra_qty);
  end loop;

  return v_base_cents + v_extras_cents;
end;
$fn$;

-- A funcao e chamada pela Edge Function (service_role). O app nunca chama.
revoke all on function public.compute_order_amount_cents(text, uuid[], uuid, jsonb)
  from public, anon, authenticated;
