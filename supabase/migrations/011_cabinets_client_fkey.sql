-- =====================================================
-- К2 Платформа: Миграция #011 — FK cabinets.client_id → clients.id
--
-- Зачем: В исходной миграции 010_cabinets.sql client_id был добавлен
-- как обычный UUID без foreign key constraint. Это работает для записи,
-- но Supabase-js не может сделать nested select 'clients(name)' без FK.
-- Из-за этого listCabinets() не подтягивает имя клиента автоматически.
--
-- Что делаем: Добавляем FK с ON DELETE SET NULL — если клиента удаляют,
-- шкафы остаются как "черновики" (client_id = NULL), а не удаляются вместе.
-- Это безопаснее: пользователь не теряет работу из-за случайного удаления
-- клиента, а просто видит шкаф в списке черновиков и может перепривязать.
-- =====================================================

-- Сначала очищаем "висячие" client_id — те, что ссылаются на несуществующих клиентов.
-- Без этого ALTER TABLE упадёт с ошибкой violation на таких записях.
UPDATE cabinets
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND client_id NOT IN (SELECT id FROM clients);

-- Добавляем FK
ALTER TABLE cabinets
  ADD CONSTRAINT cabinets_client_id_fkey
  FOREIGN KEY (client_id)
  REFERENCES clients(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT cabinets_client_id_fkey ON cabinets
  IS 'Привязка шкафа к клиенту CRM. ON DELETE SET NULL — при удалении клиента шкаф становится черновиком, а не удаляется.';
