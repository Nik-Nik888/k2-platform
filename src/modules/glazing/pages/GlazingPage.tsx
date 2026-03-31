import { useState } from 'react';
import { PanelTop, Plus, Trash2, Download } from 'lucide-react';
import type { ProfileType, GlassType, SectionType } from '@shared/types';

const PROFILES: { value: ProfileType; label: string; price: string }[] = [
  { value: 'rehau', label: 'REHAU Blitz', price: 'от 3 200 ₽/м²' },
  { value: 'kbe', label: 'KBE Engine', price: 'от 2 900 ₽/м²' },
  { value: 'veka', label: 'VEKA Euroline', price: 'от 3 100 ₽/м²' },
  { value: 'novotex', label: 'Novotex Classic', price: 'от 2 600 ₽/м²' },
  { value: 'aluminium_cold', label: 'Алюминий (холодный)', price: 'от 2 200 ₽/м²' },
  { value: 'aluminium_warm', label: 'Алюминий (тёплый)', price: 'от 4 500 ₽/м²' },
];

const GLASS_TYPES: { value: GlassType; label: string }[] = [
  { value: 'single', label: 'Однокамерный' },
  { value: 'double', label: 'Двухкамерный' },
  { value: 'triple', label: 'Трёхкамерный' },
  { value: 'energy_saving', label: 'Энергосберегающий' },
];

interface Section {
  id: string;
  type: SectionType;
  width: number;
}

const SECTION_LABELS: Record<SectionType, string> = {
  fixed: 'Глухое',
  sliding: 'Раздвижное',
  tilt_turn: 'Поворотно-откидное',
  tilt: 'Откидное',
};

export function GlazingPage() {
  const [profile, setProfile] = useState<ProfileType>('rehau');
  const [glass, setGlass] = useState<GlassType>('double');
  const [totalWidth] = useState(3000);
  const [height] = useState(1500);
  const [sections, setSections] = useState<Section[]>([
    { id: '1', type: 'fixed', width: 800 },
    { id: '2', type: 'tilt_turn', width: 700 },
    { id: '3', type: 'tilt_turn', width: 700 },
    { id: '4', type: 'fixed', width: 800 },
  ]);

  const addSection = () => {
    setSections([...sections, {
      id: crypto.randomUUID(),
      type: 'fixed',
      width: 600,
    }]);
  };

  const removeSection = (id: string) => {
    if (sections.length <= 1) return;
    setSections(sections.filter(s => s.id !== id));
  };

  const updateSection = (id: string, updates: Partial<Section>) => {
    setSections(sections.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  // SVG rendering
  const svgPadding = 40;
  const svgWidth = 600;
  const svgScale = (svgWidth - svgPadding * 2) / totalWidth;
  const svgHeight = height * svgScale + svgPadding * 2;
  const actualTotalW = sections.reduce((a, s) => a + s.width, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Остекление</h1>
          <p className="text-sm text-gray-500 mt-1">2D-проекция и расчёт стоимости</p>
        </div>
        <button className="btn-primary">
          <Download className="w-4 h-4" /> Экспорт PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* SVG Canvas */}
        <div className="card p-6">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full border border-surface-100 rounded-lg bg-white"
          >
            {/* Frame */}
            <rect
              x={svgPadding}
              y={svgPadding}
              width={actualTotalW * svgScale}
              height={height * svgScale}
              fill="none"
              stroke="#1E3A5F"
              strokeWidth="3"
              rx="2"
            />

            {/* Sections */}
            {sections.reduce((acc, section, i) => {
              const x = acc.x;
              const w = section.width * svgScale;
              const h = height * svgScale;
              const y = svgPadding;

              const isOperable = section.type !== 'fixed';

              acc.elements.push(
                <g key={section.id}>
                  {/* Section rect */}
                  <rect
                    x={x} y={y} width={w} height={h}
                    fill={isOperable ? '#EFF6FF' : '#F8FAFC'}
                    stroke="#1E3A5F"
                    strokeWidth="1.5"
                  />
                  {/* Opening indicator */}
                  {section.type === 'tilt_turn' && (
                    <>
                      <line x1={x + w / 2} y1={y + 4} x2={x + w / 2} y2={y + h - 4}
                        stroke="#2563EB" strokeWidth="1" strokeDasharray="4 3" />
                      <line x1={x + 4} y1={y + h / 2} x2={x + w - 4} y2={y + h / 2}
                        stroke="#2563EB" strokeWidth="1" strokeDasharray="4 3" />
                      {/* Triangle indicator */}
                      <polygon
                        points={`${x + w / 2},${y + 8} ${x + 8},${y + h - 8} ${x + w - 8},${y + h - 8}`}
                        fill="none" stroke="#2563EB" strokeWidth="0.8" opacity="0.4"
                      />
                    </>
                  )}
                  {section.type === 'tilt' && (
                    <>
                      <line x1={x + 4} y1={y + h / 2} x2={x + w - 4} y2={y + h / 2}
                        stroke="#2563EB" strokeWidth="1" strokeDasharray="4 3" />
                    </>
                  )}
                  {section.type === 'sliding' && (
                    <>
                      <line x1={x + w * 0.3} y1={y + 8} x2={x + w * 0.3} y2={y + h - 8}
                        stroke="#F97316" strokeWidth="1.5" />
                      <polygon
                        points={`${x + w * 0.3 + 6},${y + h / 2} ${x + w * 0.3 - 2},${y + h / 2 - 6} ${x + w * 0.3 - 2},${y + h / 2 + 6}`}
                        fill="#F97316"
                      />
                    </>
                  )}
                  {/* Width label */}
                  <text
                    x={x + w / 2} y={y + h + 16}
                    textAnchor="middle" fontSize="11" fill="#64748B" fontFamily="Inter, sans-serif"
                  >
                    {section.width}
                  </text>
                  {/* Type label */}
                  <text
                    x={x + w / 2} y={y + h / 2 + 4}
                    textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="Inter, sans-serif"
                  >
                    {SECTION_LABELS[section.type]}
                  </text>
                </g>
              );

              return { x: x + w, elements: acc.elements };
            }, { x: svgPadding, elements: [] as React.ReactNode[] }).elements}

            {/* Height dimension */}
            <text
              x={svgPadding - 8}
              y={svgPadding + (height * svgScale) / 2}
              textAnchor="middle" fontSize="11" fill="#64748B"
              fontFamily="Inter, sans-serif"
              transform={`rotate(-90, ${svgPadding - 8}, ${svgPadding + (height * svgScale) / 2})`}
            >
              {height} мм
            </text>

            {/* Total width */}
            <text
              x={svgPadding + (actualTotalW * svgScale) / 2}
              y={svgPadding - 10}
              textAnchor="middle" fontSize="12" fill="#1E3A5F" fontWeight="600"
              fontFamily="Inter, sans-serif"
            >
              {actualTotalW} мм (общая)
            </text>
          </svg>

          {/* Section editor */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Секции ({sections.length})</h3>
              <button onClick={addSection} className="btn-secondary text-xs py-1.5 px-3">
                <Plus className="w-3 h-3" /> Добавить
              </button>
            </div>
            {sections.map((section, i) => (
              <div key={section.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface-50">
                <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                <select
                  value={section.type}
                  onChange={(e) => updateSection(section.id, { type: e.target.value as SectionType })}
                  className="input py-1.5 text-xs flex-1"
                >
                  {Object.entries(SECTION_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={section.width}
                  onChange={(e) => updateSection(section.id, { width: Number(e.target.value) })}
                  className="input py-1.5 text-xs w-24"
                  min={200}
                  max={2000}
                />
                <span className="text-xs text-gray-400">мм</span>
                <button
                  onClick={() => removeSection(section.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  disabled={sections.length <= 1}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Config panel */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Профиль</h3>
            <div className="space-y-2">
              {PROFILES.map((p) => (
                <label
                  key={p.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    profile === p.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <input
                    type="radio" name="profile"
                    checked={profile === p.value}
                    onChange={() => setProfile(p.value)}
                    className="sr-only"
                  />
                  <PanelTop className={`w-4 h-4 ${profile === p.value ? 'text-brand-600' : 'text-gray-400'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{p.label}</p>
                    <p className="text-xs text-gray-500">{p.price}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Стеклопакет</h3>
            <select
              value={glass}
              onChange={(e) => setGlass(e.target.value as GlassType)}
              className="input text-sm"
            >
              {GLASS_TYPES.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div className="card p-4 bg-brand-50 border-brand-200">
            <p className="text-sm text-brand-700 font-medium">Предварительная стоимость</p>
            <p className="text-3xl font-bold text-brand-800 mt-1">42 500 ₽</p>
            <p className="text-xs text-brand-600 mt-2">
              Профиль + стеклопакет + фурнитура + монтаж
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
