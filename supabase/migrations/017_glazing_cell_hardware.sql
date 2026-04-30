-- ═══════════════════════════════════════════════════════════════════
-- 017_glazing_cell_hardware.sql
--
-- Добавляет в справочник:
--   1. Доп. фурнитуру по ячейкам (детские замки, гребёнка, эйрбокс).
--      Это отдельные материалы которые менеджер ставит на конкретную
--      открывающуюся створку — НЕ путать с общей фурнитурой Roto/Maco
--      (категория «Фурнитура» в seed 013).
--
--   2. Недостающие типы москитных сеток ('plug' = вкладная,
--      'antidust' = антипыль) если их ещё нет — чтобы все 4 варианта
--      из MosquitoType были в справочнике.
--
-- Эти материалы матчатся при расчёте сметы (doGlazing.ts) с типами
-- HardwareItem и MosquitoType из ячеек проекта.
--
-- Идемпотентна.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_id UUID := '980bd825-13c8-49a0-9490-2cfd7b8fc755';
  cat_mosquito UUID;
  cat_cell_hardware UUID;
BEGIN

  -- ═══════════════════════════════════════════════════════════════
  -- 1. Категория «Доп. фурнитура (по ячейкам)»
  -- Отдельно от общей фурнитуры Roto/Maco — иначе менеджер их перепутает
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Доп. фурнитура (по ячейкам)', '🔒', '#8B5CF6', 'glazing', 36)
  ON CONFLICT DO NOTHING;

  SELECT id INTO cat_cell_hardware FROM material_categories
    WHERE org_id = v_org_id
      AND name = 'Доп. фурнитура (по ячейкам)'
      AND module_scope = 'glazing'
    LIMIT 1;

  -- Материалы. Названия ВАЖНЫ — они матчатся в doGlazing.ts по подстроке.
  IF cat_cell_hardware IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_cell_hardware, x.name, 'шт.', x.price, x.descr
    FROM (VALUES
      ('Детские замки',  450::numeric, 'на одну створку, защита от открытия детьми'),
      ('Гребёнка',       180::numeric, 'для микропроветривания'),
      ('Эйрбокс',        2800::numeric, 'приточный клапан')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials
        WHERE org_id = v_org_id
          AND category_id = cat_cell_hardware
          AND materials.name = x.name
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. Недостающие москитки (под MosquitoType из кода)
  -- ═══════════════════════════════════════════════════════════════

  SELECT id INTO cat_mosquito FROM material_categories
    WHERE org_id = v_org_id
      AND name = 'Москитные сетки'
      AND module_scope = 'glazing'
    LIMIT 1;

  IF cat_mosquito IS NOT NULL THEN
    -- Стандартная сетка (с явным «стандарт» в названии для матчинга)
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_mosquito, 'Сетка стандартная', 'шт.', 1200::numeric,
           'рамочная стандартная (для матчинга с MosquitoType=standard)'
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_mosquito AND materials.name = 'Сетка стандартная'
    );

    -- Антипыль
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_mosquito, 'Сетка антипыль', 'шт.', 1900::numeric,
           'мелкое плетение, защита от пыли (для MosquitoType=antidust)'
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_mosquito AND materials.name = 'Сетка антипыль'
    );

    -- Вкладная (плунжерная)
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_mosquito, 'Сетка вкладная', 'шт.', 1100::numeric,
           'без рамки (для MosquitoType=plug)'
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_mosquito AND materials.name = 'Сетка вкладная'
    );
  END IF;

END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Конец миграции 017_glazing_cell_hardware.sql
-- ═══════════════════════════════════════════════════════════════════
