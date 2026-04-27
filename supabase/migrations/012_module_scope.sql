-- ═══════════════════════════════════════════════════════════════════
-- 012_module_scope.sql
--
-- Добавляет поле module_scope в material_categories для разделения
-- категорий между модулями: Калькулятор / Остекление / Общее.
--
-- Используется страницей "Справочник" (/reference) и фильтрацией
-- категорий внутри модулей Calculator и Glazing.
--
-- Безопасность: миграция идемпотентна — можно прогнать повторно
-- без поломки существующих данных. Все существующие категории
-- по умолчанию получают scope='calc' (как и было до миграции).
-- ═══════════════════════════════════════════════════════════════════

-- ── Поле module_scope ─────────────────────────────────────────────
-- 'calc'    — только для калькулятора материалов
-- 'glazing' — только для модуля остекления
-- 'both'    — общие категории (например: «Работы», «Доставка»)
ALTER TABLE material_categories
  ADD COLUMN IF NOT EXISTS module_scope TEXT NOT NULL DEFAULT 'calc'
    CHECK (module_scope IN ('calc', 'glazing', 'both'));

-- Индекс для быстрой фильтрации в UI
CREATE INDEX IF NOT EXISTS idx_material_categories_module_scope
  ON material_categories(module_scope);

-- ── Комментарий для документирования ──────────────────────────────
COMMENT ON COLUMN material_categories.module_scope IS
  'Принадлежность категории к модулю: calc | glazing | both';
