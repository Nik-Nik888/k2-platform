-- ═══════════════════════════════════════════════════════════════════
-- 014_glazing_extended.sql
--
-- Дополняет 013_glazing_seed.sql недостающими категориями и материалами
-- для полноценной работы ConfigPopup модуля остекления.
--
-- Что добавляется:
--   • Категория «Соединительные профили 90°» (под углом, для Г-образных балконов)
--   • Категория «Соединительные профили 135°» (под углом 135°)
--   • Расширение цветов ламинации до 18 (как в PVC Studio)
--   • Дополнительные стеклопакеты (4-10-4, 4-16-4, мультифункциональный)
--   • Расширенный список работ (отделка откосов, шумоизоляция и т.д.)
--   • Дополнительные москитки если их ещё нет
--
-- Идемпотентна: повторный запуск не создаёт дублей.
-- Org ID организации К2 Балкон: 980bd825-13c8-49a0-9490-2cfd7b8fc755
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_id UUID := '980bd825-13c8-49a0-9490-2cfd7b8fc755';

  cat_connectors_90  UUID;       -- соединительные профили 90°
  cat_connectors_135 UUID;       -- соединительные профили 135°
  cat_lam_in         UUID;       -- ламинация внутренняя (существует)
  cat_lam_out        UUID;       -- ламинация внешняя (существует)
  cat_glass          UUID;       -- стеклопакеты (существует)
  cat_works          UUID;       -- работы (существует)
  cat_mosquito       UUID;       -- москитные сетки (существует)
BEGIN

  -- ═══════════════════════════════════════════════════════════════
  -- 1. НОВЫЕ КАТЕГОРИИ
  -- ═══════════════════════════════════════════════════════════════

  -- 🔗 Соединительные профили 90°
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Соединительные профили 90°', '📐', '#3B82F6', 'glazing', 102)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_connectors_90 FROM material_categories
    WHERE org_id = v_org_id AND name = 'Соединительные профили 90°' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🔗 Соединительные профили 135°
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Соединительные профили 135°', '📐', '#3B82F6', 'glazing', 104)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_connectors_135 FROM material_categories
    WHERE org_id = v_org_id AND name = 'Соединительные профили 135°' AND module_scope = 'glazing'
    LIMIT 1;

  -- Получаем существующие категории для добавления новых материалов
  SELECT id INTO cat_lam_in FROM material_categories
    WHERE org_id = v_org_id AND name = 'Ламинация внутренняя' AND module_scope = 'glazing'
    LIMIT 1;
  SELECT id INTO cat_lam_out FROM material_categories
    WHERE org_id = v_org_id AND name = 'Ламинация внешняя' AND module_scope = 'glazing'
    LIMIT 1;
  SELECT id INTO cat_glass FROM material_categories
    WHERE org_id = v_org_id AND name = 'Стеклопакеты' AND module_scope = 'glazing'
    LIMIT 1;
  SELECT id INTO cat_works FROM material_categories
    WHERE org_id = v_org_id AND name = 'Работы (остекление)' AND module_scope = 'both'
    LIMIT 1;
  SELECT id INTO cat_mosquito FROM material_categories
    WHERE org_id = v_org_id AND name = 'Москитные сетки' AND module_scope = 'glazing'
    LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. МАТЕРИАЛЫ
  -- ═══════════════════════════════════════════════════════════════

  -- ── Соединительные профили 90° (4 типа) ──────────────────
  IF cat_connectors_90 IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_connectors_90, name, 'п.м.', price, descr
    FROM (VALUES
      ('Соединитель 90° тип 1',  280::numeric, 'универсальный'),
      ('Соединитель 90° тип 2',  320::numeric, 'усиленный'),
      ('Соединитель 90° тип 3',  380::numeric, 'премиум'),
      ('Соединитель 90° тип 4',  450::numeric, 'с термовставкой')
    ) AS v(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_connectors_90 AND materials.name = v.name
    );
  END IF;

  -- ── Соединительные профили 135° (4 типа) ─────────────────
  IF cat_connectors_135 IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_connectors_135, name, 'п.м.', price, descr
    FROM (VALUES
      ('Соединитель 135° тип 1', 320::numeric, 'универсальный'),
      ('Соединитель 135° тип 2', 360::numeric, 'усиленный'),
      ('Соединитель 135° тип 3', 420::numeric, 'премиум'),
      ('Соединитель 135° тип 4', 500::numeric, 'с термовставкой')
    ) AS v(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_connectors_135 AND materials.name = v.name
    );
  END IF;

  -- ── Расширение ламинации внутренней (до 18 цветов) ─────
  IF cat_lam_in IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price)
    SELECT v_org_id, cat_lam_in, name, 'п.м.', 450::numeric
    FROM (VALUES
      ('Ламинация внутр. берёза'),
      ('Ламинация внутр. бук'),
      ('Ламинация внутр. гикори'),
      ('Ламинация внутр. жёлтый'),
      ('Ламинация внутр. зелёный'),
      ('Ламинация внутр. клен'),
      ('Ламинация внутр. красное дерево'),
      ('Ламинация внутр. красный'),
      ('Ламинация внутр. ольха'),
      ('Ламинация внутр. синий'),
      ('Ламинация внутр. сосна'),
      ('Ламинация внутр. тополь'),
      ('Ламинация внутр. ясень')
    ) AS v(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_lam_in AND materials.name = v.name
    );
  END IF;

  -- ── Расширение ламинации внешней (до 18 цветов) ────────
  IF cat_lam_out IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price)
    SELECT v_org_id, cat_lam_out, name, 'п.м.', 500::numeric
    FROM (VALUES
      ('Ламинация внешн. берёза'),
      ('Ламинация внешн. бук'),
      ('Ламинация внешн. гикори'),
      ('Ламинация внешн. жёлтый'),
      ('Ламинация внешн. зелёный'),
      ('Ламинация внешн. клен'),
      ('Ламинация внешн. красное дерево'),
      ('Ламинация внешн. красный'),
      ('Ламинация внешн. ольха'),
      ('Ламинация внешн. синий'),
      ('Ламинация внешн. сосна'),
      ('Ламинация внешн. тополь'),
      ('Ламинация внешн. ясень'),
      ('Ламинация внешн. бордо'),
      ('Ламинация внешн. серый'),
      ('Ламинация внешн. чёрный')
    ) AS v(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_lam_out AND materials.name = v.name
    );
  END IF;

  -- ── Дополнительные стеклопакеты ──────────────────────────
  IF cat_glass IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_glass, name, 'м²', price, descr
    FROM (VALUES
      ('СПД 4-10-4',                1100::numeric, 'однокамерный, эконом'),
      ('СПД 4-16-4',                1250::numeric, 'однокамерный, утеплённый'),
      ('СПТ 4-10-4-10-4',           1700::numeric, 'двухкамерный'),
      ('СПТ 4-16-4-12-4',           1850::numeric, 'двухкамерный, расширенный'),
      ('Мультифункциональный',      2400::numeric, 'И-стекло + энергосбережение')
    ) AS v(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_glass AND materials.name = v.name
    );
  END IF;

  -- ── Дополнительные работы ────────────────────────────────
  IF cat_works IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_works, name, unit, price, descr
    FROM (VALUES
      ('Отделка откосов внутр.',    'п.м.',  450::numeric, 'пластик/гипсокартон'),
      ('Отделка откосов внешн.',    'п.м.',  550::numeric, 'сэндвич-панель'),
      ('Шумоизоляция доп.',         'м²',    300::numeric, 'утеплитель + герметизация'),
      ('Утепление монтажного шва',  'п.м.',  150::numeric, 'пена + герметик'),
      ('Регулировка фурнитуры',     'шт.',   200::numeric, 'настройка створок')
    ) AS v(name, unit, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_works AND materials.name = v.name
    );
  END IF;

  -- ── Дополнительные москитки если нет ────────────────────
  -- (на случай если в 013 не были добавлены антипыль/вкладные)
  IF cat_mosquito IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_mosquito, name, 'шт.', price, descr
    FROM (VALUES
      ('Сетка вкладная (плунжерная)', 1100::numeric, 'без рамки, для глухих створок'),
      ('Сетка антипыль',              1900::numeric, 'мелкое плетение, защита от пыли')
    ) AS v(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials WHERE org_id = v_org_id
        AND category_id = cat_mosquito AND materials.name = v.name
    );
  END IF;

END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Конец миграции 014_glazing_extended.sql
-- ═══════════════════════════════════════════════════════════════════
