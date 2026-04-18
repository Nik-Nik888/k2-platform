// migrate-data.mjs — Перенос данных калькулятора из старого Supabase в новый
// Запуск: node migrate-data.mjs

import { createClient } from '@supabase/supabase-js';

// ── Старый Supabase (К2 Калькулятор) ──
const OLD = createClient(
  'https://ynpqayssjwtlocncexgg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlucHFheXNzand0bG9jbmNleGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTEyNzMsImV4cCI6MjA4OTQyNzI3M30.IIz-QZ8i2bwrD4Ade-YcgI_hNAbp5XuMzQPLqnrS-cs'
);

// ── Новый Supabase (К2 Платформа) ──
const NEW = createClient(
  'https://vhxqoribxhvahmfhamaw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoeHFvcmlieGh2YWhtZmhhbWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDAyNjcsImV4cCI6MjA5MDUxNjI2N30.MpFdpekvrTrPhQHJgVxt6uVFMvgbGMOeo5mMLzZ1HJM'
);

const ORG_ID = '980bd825-13c8-49a0-9490-2cfd7b8fc755';

async function migrate() {
  console.log('🚀 Начинаем миграцию данных...\n');

  // ── 1. Материалы ──
  console.log('📦 Загружаю материалы из старой БД...');
  const { data: oldMaterials, error: matErr } = await OLD
    .from('materials')
    .select('*')
    .order('id');

  if (matErr) { console.error('❌ Ошибка загрузки материалов:', matErr.message); return; }
  console.log('   Найдено: ' + oldMaterials.length + ' материалов');
  console.log('   Организация: ' + ORG_ID);

  // Проверяем есть ли уже материалы в новой БД
  const { data: existingMats } = await NEW.from('materials').select('id').limit(1);

  // Маппинг старых ID → новых ID
  const matIdMap = {};

  if (existingMats && existingMats.length > 0) {
    console.log('   ⚠️  Материалы уже есть в новой БД, строю маппинг...');
    const { data: newMats } = await NEW.from('materials').select('id, name');
    for (const om of oldMaterials) {
      const nm = (newMats || []).find(function(n) { return n.name === om.name; });
      if (nm) matIdMap[om.id] = nm.id;
    }
    console.log('   Найдено совпадений: ' + Object.keys(matIdMap).length);
  } else {
    console.log('   Вставляю материалы в новую БД...');
    let count = 0;
    for (const mat of oldMaterials) {
      const { data: inserted, error: insErr } = await NEW
        .from('materials')
        .insert({
          org_id: ORG_ID,
          name: mat.name,
          unit: mat.unit || 'шт',
          price: mat.price || 0,
          description: mat.dimensions || null,
          sku: mat.sku || null,
        })
        .select('id')
        .single();

      if (insErr) {
        console.error('   ❌ Ошибка "' + mat.name + '":', insErr.message);
      } else {
        matIdMap[mat.id] = inserted.id;
        count++;
      }
    }
    console.log('   ✅ Вставлено: ' + count + ' материалов');
  }

  // ── 2. Категории ──
  console.log('\n📂 Загружаю категории...');
  const { data: oldCats, error: catErr } = await OLD
    .from('categories')
    .select('*')
    .order('sort_order');

  if (catErr) { console.error('❌ Ошибка:', catErr.message); return; }
  console.log('   Найдено: ' + oldCats.length + ' категорий');

  const { data: existingCats } = await NEW.from('categories').select('id').limit(1);
  const catIdMap = {};

  if (existingCats && existingCats.length > 0) {
    console.log('   ⚠️  Категории уже есть, строю маппинг...');
    const { data: newCats } = await NEW.from('categories').select('id, tab_id, name');
    for (const oc of oldCats) {
      const nc = (newCats || []).find(function(n) { return n.tab_id === oc.tab_id && n.name === oc.name; });
      if (nc) catIdMap[oc.id] = nc.id;
    }
    console.log('   Найдено совпадений: ' + Object.keys(catIdMap).length);
  } else {
    console.log('   Вставляю категории...');
    let count = 0;
    for (const cat of oldCats) {
      const { data: inserted, error: insErr } = await NEW
        .from('categories')
        .insert({
          tab_id: cat.tab_id,
          name: cat.name,
          sort_order: cat.sort_order || 0,
        })
        .select('id')
        .single();

      if (insErr) {
        console.error('   ❌ "' + cat.name + '":', insErr.message);
      } else {
        catIdMap[cat.id] = inserted.id;
        count++;
      }
    }
    console.log('   ✅ Вставлено: ' + count + ' категорий');
  }

  // ── 3. Варианты (category_options) ──
  console.log('\n📋 Загружаю варианты...');
  const { data: oldOpts, error: optErr } = await OLD
    .from('category_options')
    .select('*')
    .order('sort_order');

  if (optErr) { console.error('❌ Ошибка:', optErr.message); return; }
  console.log('   Найдено: ' + oldOpts.length + ' вариантов');

  const { data: existingOpts } = await NEW.from('category_options').select('id').limit(1);
  const optIdMap = {};

  if (existingOpts && existingOpts.length > 0) {
    console.log('   ⚠️  Варианты уже есть, строю маппинг...');
    const { data: newOpts } = await NEW.from('category_options').select('id, category_id, name');
    for (const oo of oldOpts) {
      const newCatId = catIdMap[oo.category_id];
      if (!newCatId) continue;
      const no = (newOpts || []).find(function(n) { return n.category_id === newCatId && n.name === oo.name; });
      if (no) optIdMap[oo.id] = no.id;
    }
    console.log('   Найдено совпадений: ' + Object.keys(optIdMap).length);
  } else {
    console.log('   Вставляю варианты...');
    let count = 0;
    let skipped = 0;
    for (const opt of oldOpts) {
      const newCatId = catIdMap[opt.category_id];
      if (!newCatId) {
        skipped++;
        continue;
      }
      const { data: inserted, error: insErr } = await NEW
        .from('category_options')
        .insert({
          category_id: newCatId,
          name: opt.name,
          sort_order: opt.sort_order || 0,
        })
        .select('id')
        .single();

      if (insErr) {
        console.error('   ❌ "' + opt.name + '":', insErr.message);
      } else {
        optIdMap[opt.id] = inserted.id;
        count++;
      }
    }
    console.log('   ✅ Вставлено: ' + count + ', пропущено (нет категории): ' + skipped);
  }

  // ── 4. Привязки материалов (option_materials) ──
  console.log('\n🔗 Загружаю привязки материалов...');
  const { data: oldOM, error: omErr } = await OLD
    .from('option_materials')
    .select('*');

  if (omErr) { console.error('❌ Ошибка:', omErr.message); return; }
  console.log('   Найдено: ' + oldOM.length + ' привязок');

  const { data: existingOM } = await NEW.from('option_materials').select('id').limit(1);

  if (existingOM && existingOM.length > 0) {
    console.log('   ⚠️  Привязки уже есть, пропускаю...');
  } else {
    console.log('   Вставляю привязки...');
    let inserted = 0;
    let skipped = 0;

    for (const om of oldOM) {
      const newOptId = optIdMap[om.option_id];
      const newMatId = matIdMap[om.material_id];

      if (!newOptId || !newMatId) {
        skipped++;
        continue;
      }

      const { error: insErr } = await NEW
        .from('option_materials')
        .insert({
          option_id: newOptId,
          material_id: newMatId,
          quantity: om.quantity || 0,
          visible: om.visible !== false,
          calc_mode: om.calc_mode || 'fixed',
        });

      if (insErr) {
        console.error('   ❌ Привязка opt=' + om.option_id + ' mat=' + om.material_id + ':', insErr.message);
      } else {
        inserted++;
      }
    }
    console.log('   ✅ Вставлено: ' + inserted + ', пропущено: ' + skipped);
  }

  // ── Итог ──
  console.log('\n==================================================');
  console.log('✅ Миграция завершена!');
  console.log('   Материалов: ' + Object.keys(matIdMap).length);
  console.log('   Категорий: ' + Object.keys(catIdMap).length);
  console.log('   Вариантов: ' + Object.keys(optIdMap).length);
  console.log('==================================================');
}

migrate().catch(function(err) {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});