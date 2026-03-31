import { Box, MousePointer2, RotateCcw, ZoomIn, Download, Lightbulb } from 'lucide-react';

export function VisualizerPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">3D Визуализатор</h1>
        <p className="text-sm text-gray-500 mt-1">Интерактивная модель балкона</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* 3D Viewport placeholder */}
        <div className="card overflow-hidden">
          <div className="aspect-[16/10] bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex flex-col items-center justify-center relative">
            {/* Grid lines */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Placeholder 3D wireframe */}
            <div className="relative">
              <div className="w-64 h-40 border-2 border-blue-400/40 rounded-sm"
                style={{ transform: 'perspective(600px) rotateX(15deg) rotateY(-25deg)' }}>
                <div className="absolute inset-x-4 top-2 bottom-1/2 border border-sky-400/30 rounded-sm" />
                <div className="absolute inset-x-4 top-2 bottom-1/2 grid grid-cols-3 gap-1 p-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="border border-sky-300/20 rounded-sm" />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-white/30 text-sm mt-6 font-medium">
              Three.js viewport — Этап 4
            </p>

            {/* Toolbar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-lg p-1">
              {[
                { icon: MousePointer2, label: 'Выбор' },
                { icon: RotateCcw, label: 'Вращение' },
                { icon: ZoomIn, label: 'Зум' },
                { icon: Lightbulb, label: 'Свет' },
                { icon: Download, label: 'Скриншот' },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  title={label}
                  className="p-2 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Parameters panel */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Тип объекта</h3>
            <div className="grid grid-cols-2 gap-2">
              {['Прямой', 'Угловой Л', 'Угловой П', 'Эркер', 'Лоджия'].map((t, i) => (
                <button
                  key={t}
                  className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                    i === 0
                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                      : 'border-surface-200 text-gray-600 hover:border-surface-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Размеры (мм)</h3>
            <div className="space-y-3">
              {[
                { label: 'Длина', value: '3000' },
                { label: 'Ширина', value: '900' },
                { label: 'Высота', value: '2600' },
                { label: 'Парапет', value: '1000' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input type="number" defaultValue={value} className="input py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Отделка</h3>
            <div className="space-y-3">
              {['Стены', 'Пол', 'Потолок'].map((s) => (
                <div key={s}>
                  <label className="text-xs text-gray-500 mb-1 block">{s}</label>
                  <select className="input py-2 text-sm">
                    <option>Не выбрано</option>
                    <option>Вагонка</option>
                    <option>Панели ПВХ</option>
                    <option>Ламинат</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
