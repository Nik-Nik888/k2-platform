-- ═══════════════════════════════════════════════════════════════════
-- 013_glazing_seed.sql
--
-- Дефолтное наполнение справочника для модуля Остекление.
-- Создаёт стандартные категории (module_scope='glazing' или 'both')
-- и базовые материалы с примерными ценами.
--
-- Идемпотентна: повторный запуск не создаёт дублей —
-- проверка идёт по паре (org_id, name).
--
-- Org ID организации К2 Балкон: 980bd825-13c8-49a0-9490-2cfd7b8fc755
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_id UUID := '980bd825-13c8-49a0-9490-2cfd7b8fc755';

  -- ID категорий (заполнятся ниже)
  cat_profiles      UUID;
  cat_glass         UUID;
  cat_hardware      UUID;
  cat_sills         UUID;       -- подоконники
  cat_ebbs          UUID;       -- отливы
  cat_mosquito      UUID;       -- москитные сетки
  cat_lam_in        UUID;       -- ламинация внутренняя
  cat_lam_out       UUID;       -- ламинация внешняя
  cat_addons        UUID;       -- дополнения (подставочный, порог, наличник)
  cat_connectors    UUID;       -- соединительные профили
  cat_bones         UUID;       -- кости (усиленные соединители)
  cat_extension     UUID;       -- доборные профили
  cat_overlap       UUID;       -- нащельники
  cat_works         UUID;       -- работы (scope='both')
  cat_misc          UUID;       -- разное (шурупы, пена) (scope='both')

  -- Helper: создать категорию если её ещё нет
  -- (используем функцию-обёртку, чтобы получать существующий id если был)
BEGIN

  -- ═══════════════════════════════════════════════════════════════
  -- 1. КАТЕГОРИИ
  -- ═══════════════════════════════════════════════════════════════

  -- 🪟 Профильные системы
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Профильные системы', '🪟', '#3B82F6', 'glazing', 10)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_profiles FROM material_categories
    WHERE org_id = v_org_id AND name = 'Профильные системы' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🔲 Стеклопакеты
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Стеклопакеты', '🔲', '#06B6D4', 'glazing', 20)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_glass FROM material_categories
    WHERE org_id = v_org_id AND name = 'Стеклопакеты' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🔧 Фурнитура
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Фурнитура', '🔧', '#8B5CF6', 'glazing', 30)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_hardware FROM material_categories
    WHERE org_id = v_org_id AND name = 'Фурнитура' AND module_scope = 'glazing'
    LIMIT 1;

  -- 📐 Подоконники
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Подоконники', '📐', '#84CC16', 'glazing', 40)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_sills FROM material_categories
    WHERE org_id = v_org_id AND name = 'Подоконники' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🌧️ Отливы
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Отливы', '🌧', '#06B6D4', 'glazing', 50)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_ebbs FROM material_categories
    WHERE org_id = v_org_id AND name = 'Отливы' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🦟 Москитные сетки
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Москитные сетки', '🦟', '#F59E0B', 'glazing', 60)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_mosquito FROM material_categories
    WHERE org_id = v_org_id AND name = 'Москитные сетки' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🎨 Ламинация внутренняя
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Ламинация внутренняя', '🎨', '#EC4899', 'glazing', 70)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_lam_in FROM material_categories
    WHERE org_id = v_org_id AND name = 'Ламинация внутренняя' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🎨 Ламинация внешняя
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Ламинация внешняя', '🎨', '#EF4444', 'glazing', 80)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_lam_out FROM material_categories
    WHERE org_id = v_org_id AND name = 'Ламинация внешняя' AND module_scope = 'glazing'
    LIMIT 1;

  -- ➕ Дополнения по размеру (подставочный, порог, наличник)
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Дополнения по размеру', '📏', '#6B7280', 'glazing', 90)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_addons FROM material_categories
    WHERE org_id = v_org_id AND name = 'Дополнения по размеру' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🔗 Соединительные профили
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Соединительные профили', '🔗', '#3B82F6', 'glazing', 100)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_connectors FROM material_categories
    WHERE org_id = v_org_id AND name = 'Соединительные профили' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🦴 Кости (усиленные соединители)
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Кости (усиленные соединители)', '🦴', '#0F172A', 'glazing', 110)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_bones FROM material_categories
    WHERE org_id = v_org_id AND name = 'Кости (усиленные соединители)' AND module_scope = 'glazing'
    LIMIT 1;

  -- 📦 Доборные профили
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Доборные профили', '📦', '#8B5CF6', 'glazing', 120)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_extension FROM material_categories
    WHERE org_id = v_org_id AND name = 'Доборные профили' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🪛 Нащельники
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Нащельники', '🪛', '#10B981', 'glazing', 130)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_overlap FROM material_categories
    WHERE org_id = v_org_id AND name = 'Нащельники' AND module_scope = 'glazing'
    LIMIT 1;

  -- 🔨 Работы (общая категория, доступна и калькулятору, и остеклению)
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Работы (остекление)', '🔨', '#F97316', 'both', 140)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_works FROM material_categories
    WHERE org_id = v_org_id AND name = 'Работы (остекление)' AND module_scope = 'both'
    LIMIT 1;

  -- 🧰 Разное (шурупы, пена)
  INSERT INTO material_categories (org_id, name, icon, color, module_scope, sort_order)
  VALUES (v_org_id, 'Расходники монтажа', '🧰', '#6B7280', 'both', 150)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_misc FROM material_categories
    WHERE org_id = v_org_id AND name = 'Расходники монтажа' AND module_scope = 'both'
    LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. МАТЕРИАЛЫ (только если категория создалась)
  -- Используем NOT EXISTS чтобы не дублировать при повторном запуске.
  -- ═══════════════════════════════════════════════════════════════

  -- ── Профильные системы ─────────────────────────────────
  -- Реально используемые в К2 Балкон: REHAU, Smitz, Exprof
  IF cat_profiles IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_profiles, x.name, 'м²', x.price, x.descr
    FROM (VALUES
      ('REHAU Blitz',       3200::numeric, '60мм, 3 камеры, бюджет'),
      ('REHAU Grazio',      4200::numeric, '70мм, 5 камер, премиум'),
      ('Smitz 60',          2900::numeric, '60мм, 3 камеры'),
      ('Smitz 70',          3600::numeric, '70мм, 5 камер'),
      ('Exprof Practica',   2700::numeric, '58мм, 3 камеры'),
      ('Exprof Profecta',   3300::numeric, '70мм, 5 камер'),
      ('Алюминий холодный', 2200::numeric, 'Provedal, раздвижной'),
      ('Алюминий тёплый',   4500::numeric, 'тёплый алюминиевый профиль')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_profiles AND m.name = x.name
    );
  END IF;

  -- ── Стеклопакеты ───────────────────────────────────────
  IF cat_glass IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_glass, x.name, 'м²', x.price, x.descr
    FROM (VALUES
      ('Однокамерный 4-16-4',         1200::numeric, '24мм, обычное стекло'),
      ('Двухкамерный 4-10-4-10-4',    1800::numeric, '32мм, обычное стекло'),
      ('Энергосберегающий 4-16-4i',   1900::numeric, '24мм, i-стекло'),
      ('Энергосберегающий 2-камерный',2600::numeric, '32мм, i-стекло, аргон')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_glass AND m.name = x.name
    );
  END IF;

  -- ── Фурнитура ──────────────────────────────────────────
  IF cat_hardware IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_hardware, x.name, 'компл.', x.price, x.descr
    FROM (VALUES
      ('Фурнитура белая стандарт',   2500::numeric, 'Roto/Maco базовая'),
      ('Фурнитура белая premium',    4200::numeric, 'Roto NX/Maco MM'),
      ('Фурнитура противовзломная',  6500::numeric, 'WK1, защита от взлома')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_hardware AND m.name = x.name
    );
  END IF;

  -- ── Подоконники ────────────────────────────────────────
  IF cat_sills IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_sills, x.name, 'п.м.', x.price, x.descr
    FROM (VALUES
      ('Подоконник белый 250',    450::numeric,  'ширина 250мм'),
      ('Подоконник белый 300',    520::numeric,  'ширина 300мм'),
      ('Подоконник белый 400',    680::numeric,  'ширина 400мм'),
      ('Подоконник белый 500',    850::numeric,  'ширина 500мм'),
      ('Подоконник под мрамор 300', 720::numeric,'ламинация под мрамор'),
      ('Подоконник под мрамор 400', 950::numeric,'ламинация под мрамор'),
      ('Подоконник под дерево 300', 780::numeric,'ламинация под дерево')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_sills AND m.name = x.name
    );
  END IF;

  -- ── Отливы ─────────────────────────────────────────────
  IF cat_ebbs IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_ebbs, x.name, 'п.м.', x.price, x.descr
    FROM (VALUES
      ('Отлив белый 100',     180::numeric, 'ширина 100мм, оцинковка+полимер'),
      ('Отлив белый 150',     220::numeric, 'ширина 150мм'),
      ('Отлив белый 200',     280::numeric, 'ширина 200мм'),
      ('Отлив белый 250',     340::numeric, 'ширина 250мм'),
      ('Отлив белый 300',     420::numeric, 'ширина 300мм'),
      ('Отлив коричневый 200',320::numeric, 'ширина 200мм')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_ebbs AND m.name = x.name
    );
  END IF;

  -- ── Москитные сетки ────────────────────────────────────
  IF cat_mosquito IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_mosquito, x.name, 'шт.', x.price, x.descr
    FROM (VALUES
      ('Сетка белая стандарт',   1200::numeric, 'рамочная, до 1.5×1.5м'),
      ('Сетка коричневая',       1300::numeric, 'рамочная, коричневая'),
      ('Сетка серая',            1300::numeric, 'рамочная, серая'),
      ('Сетка антикошка',        2400::numeric, 'усиленная, для кошек')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_mosquito AND m.name = x.name
    );
  END IF;

  -- ── Ламинация внутренняя ──────────────────────────────
  -- Применяется как наценка к профилю, обычно за погонный метр конструкции
  IF cat_lam_in IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_lam_in, x.name, 'м²', x.price, 'ламинация изнутри'
    FROM (VALUES
      ('Ламинация внутр. светлый дуб',  450::numeric),
      ('Ламинация внутр. тёмный дуб',   450::numeric),
      ('Ламинация внутр. золотой дуб',  450::numeric),
      ('Ламинация внутр. орех',         450::numeric),
      ('Ламинация внутр. махагон',      450::numeric),
      ('Ламинация внутр. вишня',        450::numeric),
      ('Ламинация внутр. серый',        500::numeric),
      ('Ламинация внутр. чёрный',       500::numeric),
      ('Ламинация внутр. бордо',        550::numeric)
    ) AS x(name, price)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_lam_in AND m.name = x.name
    );
  END IF;

  -- ── Ламинация внешняя ──────────────────────────────────
  IF cat_lam_out IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_lam_out, x.name, 'м²', x.price, 'ламинация снаружи'
    FROM (VALUES
      ('Ламинация внешн. светлый дуб',  500::numeric),
      ('Ламинация внешн. тёмный дуб',   500::numeric),
      ('Ламинация внешн. золотой дуб',  500::numeric),
      ('Ламинация внешн. орех',         500::numeric),
      ('Ламинация внешн. серый',        550::numeric),
      ('Ламинация внешн. антрацит',     650::numeric),
      ('Ламинация внешн. чёрный',       550::numeric)
    ) AS x(name, price)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_lam_out AND m.name = x.name
    );
  END IF;

  -- ── Дополнения по размеру ──────────────────────────────
  IF cat_addons IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_addons, x.name, 'п.м.', x.price, x.descr
    FROM (VALUES
      ('Подставочный профиль',  150::numeric, 'наращивание рамы по высоте'),
      ('Порог',                 280::numeric, 'для балконных дверей'),
      ('Наличник угловой',      180::numeric, 'декоративный'),
      ('Расширитель 30мм',      220::numeric, 'наращивание профиля'),
      ('Расширитель 60мм',      320::numeric, 'наращивание профиля')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_addons AND m.name = x.name
    );
  END IF;

  -- ── Соединительные профили ─────────────────────────────
  IF cat_connectors IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_connectors, x.name, 'п.м.', x.price, x.descr
    FROM (VALUES
      ('Соединитель H-образный (косточка)', 280::numeric, 'для соединения двух рам в плоскости'),
      ('Соединитель угловой 90°',            450::numeric, 'для прямого угла Г-образного балкона'),
      ('Соединитель угловой 135°',           520::numeric, 'для эркеров'),
      ('Соединитель универсальный',          580::numeric, 'произвольный угол, для эркеров')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_connectors AND m.name = x.name
    );
  END IF;

  -- ── Кости (усиленные соединители) ──────────────────────
  IF cat_bones IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_bones, x.name, 'шт.', x.price, x.descr
    FROM (VALUES
      ('Кость лёгкая',     1200::numeric, 'тонкий усиленный соединитель, до 2.5м высоты'),
      ('Кость стандарт',   1800::numeric, 'для конструкций до 3м высоты'),
      ('Кость усиленная',  2500::numeric, 'для французского остекления, >3м')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_bones AND m.name = x.name
    );
  END IF;

  -- ── Доборные профили ───────────────────────────────────
  IF cat_extension IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_extension, x.name, 'п.м.', x.price, x.descr
    FROM (VALUES
      ('Добор 15мм',  120::numeric, 'наращивание периметра рамы'),
      ('Добор 20мм',  140::numeric, 'наращивание периметра рамы'),
      ('Добор 40мм',  180::numeric, 'наращивание периметра рамы'),
      ('Добор 60мм',  240::numeric, 'наращивание периметра рамы'),
      ('Добор 80мм',  300::numeric, 'наращивание периметра рамы'),
      ('Добор 100мм', 380::numeric, 'наращивание периметра рамы')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_extension AND m.name = x.name
    );
  END IF;

  -- ── Нащельники ─────────────────────────────────────────
  IF cat_overlap IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_overlap, x.name, 'п.м.', x.price, x.descr
    FROM (VALUES
      ('Нащельник 30мм',  90::numeric,  'белый, плоский'),
      ('Нащельник 40мм',  110::numeric, 'белый, плоский'),
      ('Нащельник 60мм',  150::numeric, 'белый, плоский'),
      ('Нащельник 80мм',  190::numeric, 'белый, плоский')
    ) AS x(name, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_overlap AND m.name = x.name
    );
  END IF;

  -- ── Работы (общие, scope=both) ─────────────────────────
  IF cat_works IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_works, x.name, x.unit, x.price, x.descr
    FROM (VALUES
      ('Демонтаж старого окна',     'шт.',   1500::numeric, 'снятие старой рамы'),
      ('Доставка',                  'усл.',  1500::numeric, 'по городу'),
      ('Подъём на этаж',            'усл.',   500::numeric, 'за 1 этаж'),
      ('Монтаж окна',               'м²',     800::numeric, 'установка в проём'),
      ('Монтаж в бетон',            'м²',    1200::numeric, 'усиленное крепление'),
      ('Монтаж отлива',             'п.м.',   200::numeric, ''),
      ('Монтаж подоконника',        'п.м.',   350::numeric, ''),
      ('Монтаж порога',             'шт.',    500::numeric, ''),
      ('Отделка откосов внутр.',    'п.м.',   600::numeric, 'сэндвич-панель'),
      ('Отделка откосов внешн.',    'п.м.',   500::numeric, 'оцинковка/пластик')
    ) AS x(name, unit, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_works AND m.name = x.name
    );
  END IF;

  -- ── Расходники монтажа ─────────────────────────────────
  IF cat_misc IS NOT NULL THEN
    INSERT INTO materials (org_id, category_id, name, unit, price, description)
    SELECT v_org_id, cat_misc, x.name, x.unit, x.price, x.descr
    FROM (VALUES
      ('Комплект шурупов', 'компл.', 200::numeric, 'крепление на 1 окно'),
      ('Пена монтажная',   'шт.',    450::numeric, 'баллон 750мл'),
      ('Пена зимняя',      'шт.',    580::numeric, 'до -10°C')
    ) AS x(name, unit, price, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM materials m
      WHERE m.org_id = v_org_id AND m.category_id = cat_misc AND m.name = x.name
    );
  END IF;

  RAISE NOTICE 'Glazing seed completed for org_id %', v_org_id;
END $$;
