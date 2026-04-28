import { useState, useEffect, useMemo } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useGlazingStore } from '../store/glazingStore';
import { WindowCanvas } from '../components/canvas/WindowCanvas';
import { CellEditPopup } from '../components/popups/CellEditPopup';
import { CornerEditPopup, type CornerEditValue } from '../components/popups/CornerEditPopup';
import { JoinPickerPopup } from '../components/popups/JoinPickerPopup';
import { NewProjectPopup } from '../components/popups/NewProjectPopup';
import { ConfigPopup } from '../components/popups/ConfigPopup';
import { WindowsStrip } from '../components/strip/WindowsStrip';
import { ResultsTable } from '../components/results/ResultsTable';
import { ConfigGearButton } from '../components/ConfigGearButton';
import { calcProject, type MaterialMap } from '../api/doGlazing';
import { loadGlazingReference, type GlazingCategoryKey, type GlazingCategoryWithItems } from '../api/glazingApi';
import { validateProject, hasErrors, countErrors, countWarns } from '../logic/validate';

// ═══════════════════════════════════════════════════════════════════
// GlazingTestPage (Этап 3.2)
// Основные изменения относительно 3.1:
//   • Inline-редактирование размеров (тап на цифру → input)
//   • Попап выбора створки (тап на ячейку)
//   • Попап добавления импоста (по кнопке)
//   • Попап углового соединителя (тап на стык)
//   • Кнопки добавления/удаления сегмента (для П/Г-образных балконов)
//   • Тап на кость → удаление с подтверждением
// ═══════════════════════════════════════════════════════════════════

export function GlazingTestPage() {
  const store = useGlazingStore();
  const project = store.data.projects.find((p) => p.id === store.data.activeProjectId);

  const [materials, setMaterials] = useState<MaterialMap | null>(null);
  const [reference, setReference] = useState<
    Partial<Record<GlazingCategoryKey, GlazingCategoryWithItems>> | null
  >(null);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);

  // ── Состояние попапов ──────────────────────────────────────────
  const [cellEditPopup, setCellEditPopup] = useState<{
    segmentId: string; frameId: string; cellId: string; subtitle: string;
  } | null>(null);

  const [cornerPopup, setCornerPopup] = useState<{
    cornerIdx: number;
    current: CornerEditValue | null;
    isCreate: boolean;
  } | null>(null);

  // Попап выбора между костью и поворотом (открывается тапом на ⊕ между рамами)
  const [joinPicker, setJoinPicker] = useState<{
    segmentId: string;
    afterFrameIndex: number;
  } | null>(null);

  // Попап создания нового проекта (выбор шаблона)
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Большой попап настроек проекта (ConfigPopup)
  const [configOpen, setConfigOpen] = useState(false);

  // ── Инициализация ──────────────────────────────────────────────
  useEffect(() => {
    store.initFromDraft();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefLoading(true);
    loadGlazingReference()
      .then((ref) => {
        if (cancelled) return;
        const map: MaterialMap = new Map();
        for (const cat of Object.values(ref)) {
          if (!cat) continue;
          for (const m of cat.materials) {
            map.set(m.id, { id: m.id, name: m.name, unit: m.unit, price: m.price });
          }
        }
        setMaterials(map);
        setReference(ref);
        setRefLoading(false);

        if (project) {
          const cfg = project.config;
          const patch: Partial<typeof cfg> = {};
          if (!cfg.profileSystemId && ref.profiles?.materials[0]) {
            patch.profileSystemId = ref.profiles.materials[0].id;
          }
          if (!cfg.glassId && ref.glass?.materials[0]) {
            patch.glassId = ref.glass.materials[0].id;
          }
          if (!cfg.hardwareId && ref.hardware?.materials[0]) {
            patch.hardwareId = ref.hardware.materials[0].id;
          }
          if (Object.keys(patch).length > 0) {
            store.setProjectConfig(project.id, patch);
          }
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setRefError(e instanceof Error ? e.message : 'Ошибка загрузки справочника');
        setRefLoading(false);
      });
    return () => { cancelled = true; };
  }, [project?.id]);

  // Материал кости по умолчанию (для quick-add)
  const defaultBoneMaterialId = useMemo(() => {
    if (!materials) return undefined;
    return Array.from(materials.values()).find((m) => m.name.includes('Кость стандарт'))?.id
        ?? Array.from(materials.values()).find((m) => m.name.includes('Кость'))?.id;
  }, [materials]);

  // Материал углового соединителя по умолчанию (90°)
  const defaultCornerMaterialId = useMemo(() => {
    if (!materials) return undefined;
    return Array.from(materials.values()).find((m) => m.name.includes('угловой 90'))?.id
        ?? Array.from(materials.values()).find((m) => m.name.includes('Соединитель'))?.id;
  }, [materials]);

  if (refLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (refError) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">{refError}</div>
    );
  }

  if (!project) return null;

  // Активные сущности (берём первую если ничего не выбрано)
  const activeSegment = project.segments.find((s) => s.id === store.activeSegmentId)
    ?? project.segments[0]!;
  const activeFrame = activeSegment.frames.find((f) => f.id === store.activeFrameId)
    ?? activeSegment.frames[0];

  const estimate = materials ? calcProject(project, materials) : null;
  const warnings = validateProject(project);

  // ── Обработчики ────────────────────────────────────────────────

  // Тап на ячейку = только активация (попап не открывается)
  function handleCellClick(segmentId: string, frameId: string, cellId: string) {
    store.setActive(segmentId, frameId, cellId);
  }

  // Тап на маленький "+" в центре активной ячейки = открыть попап редактирования
  function handleCellEditClick(segmentId: string, frameId: string, cellId: string) {
    const seg = project!.segments.find((s) => s.id === segmentId);
    const fr = seg?.frames.find((f) => f.id === frameId);
    const cell = fr?.cells.find((c) => c.id === cellId);
    if (!seg || !fr || !cell) return;
    setCellEditPopup({
      segmentId, frameId, cellId,
      subtitle: `Ячейка ${cell.width}×${cell.height} мм`,
    });
  }

  function handleImpostClick(segmentId: string, frameId: string, impostId: string) {
    if (!confirm('Удалить импост?')) return;
    store.removeImpost(project!.id, segmentId, frameId, impostId);
  }

  function handleBoneClick(segmentId: string, boneId: string) {
    if (!confirm('Удалить кость?')) return;
    store.removeBone(project!.id, segmentId, boneId);
  }

  function handleCornerClick(cornerIdx: number) {
    const corner = project!.corners[cornerIdx];
    if (!corner) return;
    setCornerPopup({
      cornerIdx,
      current: { type: corner.type, customAngle: corner.customAngle },
      isCreate: false,
    });
  }

  function handleRemoveSegment() {
    if (project!.segments.length <= 1) return;
    if (!confirm('Удалить этот сегмент со всем содержимым?')) return;
    store.removeSegment(project!.id, activeSegment.id);
  }

  function handleAddFrameToSide(segmentId: string, side: 'start' | 'end') {
    // Стандартный размер новой рамы: 750×1500 (одна створка)
    const newFrameId = store.addFrame(project!.id, segmentId, 750, side);
    // Активируем новую раму, чтобы пользователь сразу мог редактировать
    store.setActive(segmentId, newFrameId, null);
  }

  function handleRemoveFrame() {
    if (!activeFrame) return;
    if (activeSegment.frames.length <= 1) {
      alert('В сегменте должна остаться хотя бы одна рама.');
      return;
    }
    if (!confirm(`Удалить раму ${activeFrame.width}×${activeFrame.height} мм?`)) return;
    store.removeFrame(project!.id, activeSegment.id, activeFrame.id);
    store.setActive(activeSegment.id, null, null);
  }

  // ⊕ между рамами → открыть попап выбора (Кость / Поворот)
  function handleJoinClick(segmentId: string, afterFrameIndex: number) {
    setJoinPicker({ segmentId, afterFrameIndex });
  }

  // Из попапа: выбрана Кость
  function handleChooseBone() {
    if (!joinPicker) return;
    store.addBone(
      project!.id,
      joinPicker.segmentId,
      joinPicker.afterFrameIndex,
      defaultBoneMaterialId
    );
  }

  // Из попапа: выбран Поворот — разделяем сегмент в этой точке
  function handleChooseCorner() {
    if (!joinPicker) return;
    const newSegId = store.splitSegmentAt(
      project!.id,
      joinPicker.segmentId,
      joinPicker.afterFrameIndex
    );
    if (!newSegId) {
      alert('Не удалось разделить сегмент.');
      return;
    }
    // Активируем новый (правый) сегмент
    store.setActive(newSegId, null, null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Тест канваса остекления (3.2)</h1>
          <p className="text-xs text-gray-500">
            Inline-редактирование размеров, попапы, углы между сегментами.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConfigGearButton
            onClick={() => setConfigOpen(true)}
            disabled={!project}
          />
          <button onClick={() => store.reset()} className="btn-secondary text-xs py-1.5 px-3">
            Сброс
          </button>
        </div>
      </div>

      {/* ── Селектор активного сегмента ──────────────────────── */}
      {project.segments.length > 1 && (
        <div className="card p-2 flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-gray-500 px-1">Сегменты:</span>
          {project.segments.map((seg, i) => {
            const isActive = seg.id === activeSegment.id;
            return (
              <button
                key={seg.id}
                onClick={() => store.setActive(seg.id, null, null)}
                className={`px-2.5 py-1 rounded font-medium ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-100 text-gray-700 hover:bg-surface-200'
                }`}
              >
                #{i + 1} ({seg.frames.length} рам)
              </button>
            );
          })}
        </div>
      )}

      {/* ── Тулбар ──────────────────────────────────────────── */}
      <div className="card p-3 flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-gray-500 mr-1">В сегмент:</span>
        <button onClick={handleRemoveFrame}
          disabled={!activeFrame || activeSegment.frames.length <= 1}
          className="text-xs py-1.5 px-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed">
          <Trash2 className="w-3 h-3 inline mr-0.5" /> рама
        </button>

        <span className="text-xs text-gray-500 ml-3 mr-1">Балкон:</span>
        {project.segments.length > 1 && (
          <button onClick={handleRemoveSegment}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
            <Trash2 className="w-3 h-3 inline mr-0.5" /> сегмент
          </button>
        )}
      </div>

      {/* ── Канвас ──────────────────────────────────────────── */}
      <div className="card overflow-hidden" style={{ height: 520 }}>
        <WindowCanvas
          project={project}
          activeCellId={store.activeCellId}
          activeFrameId={store.activeFrameId}
          onCellClick={handleCellClick}
          onCellEditClick={handleCellEditClick}
          onImpostClick={handleImpostClick}
          onBoneClick={handleBoneClick}
          onCornerClick={handleCornerClick}
          onAddBoneAt={handleJoinClick}
          onAddFrameToSide={handleAddFrameToSide}
          onChangeSection={(segId, frId, orientation, sectionIdx, newSize, rowIdx) => {
            const result = store.setSectionWidth(project.id, segId, frId, orientation, sectionIdx, newSize, rowIdx);
            if (result === 'too_small') {
              alert(
                'Невозможно установить такой размер секции: остальным секциям не хватит места ' +
                '(минимум 200 мм на секцию).'
              );
            } else if (result === 'overflow') {
              alert(
                'Все секции зафиксированы и сумма не сходится. ' +
                'Сначала увеличьте размер рамы или нажмите "Выровнять", ' +
                'чтобы сбросить ручные размеры и распределить заново.'
              );
            }
          }}
          onResetSectionLocks={(segId, frId, orientation, rowIdx) => {
            store.resetSectionLocks(project.id, segId, frId, orientation, rowIdx);
          }}
          onChangeFrameWidth={(segId, frId, w) => {
            // Рама независима — меняем только её ширину, общий размер сегмента
            // пересчитывается автоматически (он = сумма ширин всех рам + кости).
            const seg = project.segments.find((s) => s.id === segId);
            const fr = seg?.frames.find((f) => f.id === frId);
            if (!fr) return;
            if (w < 300) {
              alert('Минимальная ширина рамы — 300 мм.');
              return;
            }
            store.setFrameSize(project.id, segId, frId, w, fr.height);
          }}
          onChangeSegmentTotalWidth={(segId, totalW) => {
            const ok = store.setSegmentTotalWidth(project.id, segId, totalW);
            if (!ok) {
              alert('Невозможно установить такую ширину: рам слишком много для этого размера.');
            }
          }}
          onChangeSegmentHeight={(segId, side, value) => {
            store.setSegmentHeight(project.id, segId, side, value);
            // Дополнительно подгоняем высоту всех рам сегмента под новое значение
            const seg = project.segments.find((s) => s.id === segId);
            if (seg) {
              const newH = side === 'both'
                ? value
                : Math.max(value, side === 'left' ? seg.heightRight : seg.heightLeft);
              for (const f of seg.frames) {
                store.setFrameSize(project.id, segId, f.id, f.width, newH);
              }
            }
          }}
        />
      </div>

      <p className="text-xs text-gray-400 px-1">
        💡 Тап на ячейку → активация. Тап на синий «+» в центре → попап (Открывание / Импост / Сетка / Фурнитура).
        Большие 🟦+ по краям → новая рама. ⊕ между рамами → выбор «Кость» или «Поворот».
      </p>

      {/* ── Лента проектов ───────────────────────────────────── */}
      <WindowsStrip
        projects={store.data.projects}
        activeProjectId={store.data.activeProjectId}
        onSelectProject={(id) => store.setActiveProject(id)}
        onAddProject={() => setNewProjectOpen(true)}
        onDeleteProject={(id) => store.removeProject(id)}
      />

      {/* ── Таблица сметы PVC-style ─────────────────────────── */}
      <ResultsTable
        data={store.data}
        activeProjectId={store.data.activeProjectId}
        projectTotals={Object.fromEntries(
          store.data.projects.map((p) => [
            p.id,
            calcProject(p, materials ?? new Map()).total,
          ])
        )}
      />

      {/* ── Детализация сметы + валидация ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-3">
          <h3 className="text-sm font-semibold mb-2">Смета</h3>
          {estimate && estimate.lines.length > 0 ? (
            <table className="w-full text-xs">
              <tbody>
                {estimate.lines.map((l, i) => (
                  <tr key={i} className="border-b border-surface-100 last:border-0">
                    <td className="py-1.5 text-gray-700">{l.name}</td>
                    <td className="py-1.5 text-right text-gray-500">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="py-1.5 text-right font-medium whitespace-nowrap">
                      {l.total.toLocaleString('ru-RU')} ₽
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={2} className="py-2 font-bold">Итого:</td>
                  <td className="py-2 text-right font-bold text-brand-700">
                    {estimate.total.toLocaleString('ru-RU')} ₽
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400">Пусто</p>
          )}
        </div>

        <div className="card p-3">
          <h3 className="text-sm font-semibold mb-2">
            Проверка по ГОСТ
            {warnings.length > 0 && (
              <span className="ml-2 text-xs">
                {hasErrors(warnings) && (
                  <span className="text-red-600">{countErrors(warnings)} ошибок</span>
                )}
                {countWarns(warnings) > 0 && (
                  <span className="text-orange-600 ml-2">{countWarns(warnings)} замечаний</span>
                )}
              </span>
            )}
          </h3>
          {warnings.length === 0 ? (
            <p className="text-xs text-green-600">✓ Замечаний нет</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {warnings.map((w, i) => (
                <li key={i} className={`text-xs px-2 py-1.5 rounded ${
                  w.level === 'error' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
                }`}>
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── ПОПАПЫ ──────────────────────────────────────────── */}

      {cellEditPopup && (() => {
        const seg = project.segments.find((s) => s.id === cellEditPopup.segmentId);
        const fr = seg?.frames.find((f) => f.id === cellEditPopup.frameId);
        const cell = fr?.cells.find((c) => c.id === cellEditPopup.cellId);
        if (!seg || !fr || !cell) return null;

        // Определяем активную полосу по активной ячейке
        const cy = cell.y + cell.height / 2;
        const horImposts = fr.imposts
          .filter((i) => i.orientation === 'horizontal')
          .sort((a, b) => a.position - b.position);
        let activeRowIdx = 0;
        for (let i = 0; i < horImposts.length; i++) {
          if (cy > horImposts[i]!.position) activeRowIdx = i + 1;
        }

        // Сколько импостов уже есть (для расчёта помещается ли N новых)
        const verticalsInRow = fr.imposts.filter(
          (i) => i.orientation === 'vertical' && (i.belongsToRow ?? 0) === activeRowIdx
        ).length;
        const horizontalsInFrame = fr.imposts.filter(
          (i) => i.orientation === 'horizontal'
        ).length;

        return (
          <CellEditPopup
            cellSubtitle={cellEditPopup.subtitle}
            currentSash={cell.sash}
            currentMosquito={cell.mosquito ?? null}
            currentHardware={cell.hardware ?? []}
            rowWidth={fr.width}
            frameHeight={fr.height}
            existingVerticalsInRow={verticalsInRow}
            existingHorizontalsInFrame={horizontalsInFrame}
            onClose={() => setCellEditPopup(null)}
            onChangeSash={(s) => {
              store.setCellSash(project.id, cellEditPopup.segmentId, cellEditPopup.frameId, cellEditPopup.cellId, s);
            }}
            onChangeMosquito={(m) => {
              store.setCellMosquito(project.id, cellEditPopup.segmentId, cellEditPopup.frameId, cellEditPopup.cellId, m);
            }}
            onChangeHardware={(h) => {
              store.setCellHardware(project.id, cellEditPopup.segmentId, cellEditPopup.frameId, cellEditPopup.cellId, h);
            }}
            onAddImposts={(orientation, count) => {
              const targetRow = orientation === 'vertical' ? activeRowIdx : undefined;
              const ok = store.addImpostsEven(
                project.id, cellEditPopup.segmentId, cellEditPopup.frameId,
                orientation, count, targetRow
              );
              if (!ok) {
                alert('Не удалось добавить импосты — недостаточно места.');
              }
            }}
          />
        );
      })()}

      {cornerPopup && (
        <CornerEditPopup
          current={cornerPopup.current}
          canDelete={!cornerPopup.isCreate && project.segments.length > 1}
          onClose={() => setCornerPopup(null)}
          onSave={(v) => {
            store.setCorner(project.id, cornerPopup.cornerIdx, v.type, defaultCornerMaterialId, v.customAngle);
          }}
          onDelete={() => {
            // Удаление угла = удаление сегмента справа от него
            const segToRemove = project.segments[cornerPopup.cornerIdx + 1];
            if (segToRemove) {
              store.removeSegment(project.id, segToRemove.id);
            }
          }}
        />
      )}

      {joinPicker && (
        <JoinPickerPopup
          onClose={() => setJoinPicker(null)}
          onChooseBone={handleChooseBone}
          onChooseCorner={handleChooseCorner}
        />
      )}

      {newProjectOpen && (
        <NewProjectPopup
          suggestedName={suggestProjectName(store.data.projects)}
          onClose={() => setNewProjectOpen(false)}
          onCreate={(templateId, name) => {
            store.addProjectFromTemplate(templateId, name);
          }}
        />
      )}

      {configOpen && project && reference && (
        <ConfigPopup
          current={project.config}
          reference={reference}
          onClose={() => setConfigOpen(false)}
          onSave={(patch) => store.setProjectConfig(project.id, patch)}
        />
      )}
    </div>
  );
}

/**
 * Предлагаемое название следующего проекта — на основе уже существующих.
 * Например, если есть «Балкон 1», предлагаем «Балкон 2».
 */
function suggestProjectName(projects: { name: string }[]): string {
  // Базовое имя — первое слово существующих ("Балкон", "Окно") + следующий номер
  if (projects.length === 0) return 'Балкон 1';
  // Извлекаем базы и максимальный номер
  const counts: Record<string, number> = {};
  for (const p of projects) {
    const m = p.name.match(/^(.+?)\s*(\d+)?$/);
    if (m) {
      const base = m[1]!.trim();
      const n = m[2] ? parseInt(m[2], 10) : 1;
      counts[base] = Math.max(counts[base] ?? 0, n);
    }
  }
  // Возьмём самую частую "базу"
  const lastBase = projects[projects.length - 1]!.name.match(/^(.+?)\s*\d*$/)?.[1]?.trim() ?? 'Окно';
  const next = (counts[lastBase] ?? 0) + 1;
  return `${lastBase} ${next}`;
}
