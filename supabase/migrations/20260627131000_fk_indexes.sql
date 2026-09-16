-- Índices de cobertura para as foreign keys (advisor: unindexed_foreign_keys).
-- Melhora joins e deletes em cascata. order_extras.order_id já foi indexado
-- na migração da própria tabela.

create index if not exists groups_session_id_idx     on public.groups (session_id);
create index if not exists orders_session_id_idx      on public.orders (session_id);
create index if not exists orders_group_id_idx        on public.orders (group_id);
create index if not exists order_items_order_id_idx   on public.order_items (order_id);
create index if not exists order_items_photo_id_idx   on public.order_items (photo_id);
create index if not exists photos_session_id_idx      on public.photos (session_id);
create index if not exists photos_group_id_idx        on public.photos (group_id);
