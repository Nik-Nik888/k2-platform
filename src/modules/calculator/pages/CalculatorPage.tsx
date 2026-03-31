import { Calculator, ArrowRight } from 'lucide-react';

const MODES = [
  { id: 'walls', label: 'Отделка стен', desc: 'Вагонка, панели ПВХ, штукатурка', icon: '🧱' },
  { id: 'floor', label: 'Пол', desc: 'Ламинат, линолеум, плитка', icon: '🪵' },
  { id: 'ceiling', label: 'Потолок', desc: 'Панели, натяжной, реечный', icon: '💡' },
  { id: 'insulation', label: 'Утепление', desc: 'Пеноплекс, минвата, пенофол', icon: '🧊' },
  { id: 'electrical', label: 'Электрика', desc: 'Розетки, освещение, проводка', icon: '⚡' },
  { id: 'furniture', label: 'Мебель', desc: 'Шкафы, тумбы, полки', icon: '🪑' },
  { id: 'roof', label: 'Крыша', desc: 'Козырёк, кровля, водоотвод', icon: '🏠' },
  { id: 'hidden', label: 'Скрытые материалы', desc: 'Крепёж, герметик, монтажная пена', icon: '🔩' },
];

export function CalculatorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Калькулятор материалов</h1>
        <p className="text-sm text-gray-500 mt-1">8 режимов расчёта для полного ремонта</p>
      </div>

      {/* Mode selection grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className="card p-4 text-left hover:shadow-md hover:border-brand-300 transition-all duration-150 group"
          >
            <div className="flex items-start justify-between">
              <span className="text-2xl">{mode.icon}</span>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mt-3">{mode.label}</h3>
            <p className="text-xs text-gray-500 mt-1">{mode.desc}</p>
          </button>
        ))}
      </div>

      {/* Placeholder for calculator workspace */}
      <div className="card p-8 text-center">
        <Calculator className="w-12 h-12 text-gray-300 mx-auto" />
        <h3 className="text-lg font-semibold text-gray-700 mt-4">Выберите режим расчёта</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Калькулятор автоматически рассчитает количество и стоимость всех необходимых
          материалов на основе размеров балкона из заказа.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          Модуль будет создан параллельно с новой архитектурой на базе существующего К2 Калькулятора
        </p>
      </div>
    </div>
  );
}
