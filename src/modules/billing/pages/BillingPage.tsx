import { CreditCard, Check, Crown } from 'lucide-react';

const PLANS = [
  {
    name: 'Старт',
    price: '2 990',
    features: ['1 пользователь', 'До 30 заказов/мес', 'Калькулятор материалов', 'Остекление (2D)', 'Сметы без лого', 'Чат-поддержка'],
    missing: ['3D-визуализатор', 'Складской учёт', 'API-доступ'],
    current: false,
  },
  {
    name: 'Профи',
    price: '5 990',
    features: ['До 5 пользователей', 'До 150 заказов/мес', 'Калькулятор материалов', 'Остекление (2D)', '3D-визуализатор', 'Сметы с лого', 'Складской учёт', 'CRM', 'Приоритетная поддержка'],
    missing: ['API-доступ'],
    current: true,
    popular: true,
  },
  {
    name: 'Премиум',
    price: '11 990',
    features: ['Без ограничений на пользователей', 'Без ограничений на заказы', 'Все модули', 'Полный брендинг смет', 'API-доступ', 'Личный менеджер', 'White-label виджеты'],
    missing: [],
    current: false,
  },
];

export function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Биллинг</h1>
        <p className="text-sm text-gray-500 mt-1">Управление подпиской и тарифом</p>
      </div>

      {/* Current plan */}
      <div className="card p-5 flex items-center gap-4 bg-brand-50 border-brand-200">
        <div className="p-3 bg-brand-500 rounded-xl">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-brand-700">Текущий тариф</p>
          <p className="text-xl font-bold text-brand-900">Профи · 5 990 ₽/мес</p>
          <p className="text-xs text-brand-600 mt-0.5">Следующее списание: 1 апреля 2026</p>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`card p-5 relative ${
              plan.current ? 'border-brand-500 border-2 shadow-md' : ''
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-blue text-xs px-3 py-1">
                Популярный
              </span>
            )}
            <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
              <span className="text-sm text-gray-500">₽/мес</span>
            </div>

            <div className="mt-5 space-y-2.5">
              {plan.features.map((f) => (
                <div key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-700">{f}</span>
                </div>
              ))}
              {plan.missing.map((f) => (
                <div key={f} className="flex items-start gap-2 opacity-40">
                  <Check className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-400 line-through">{f}</span>
                </div>
              ))}
            </div>

            <button
              className={`w-full mt-6 ${plan.current ? 'btn-secondary' : 'btn-primary'}`}
              disabled={plan.current}
            >
              {plan.current ? 'Текущий' : 'Выбрать'}
            </button>
          </div>
        ))}
      </div>

      {/* Payment method */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Способ оплаты</h3>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
          <CreditCard className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-700">•••• •••• •••• 4242</span>
          <span className="text-xs text-gray-400 ml-2">Visa</span>
          <button className="ml-auto text-sm text-brand-600 font-medium hover:underline">
            Изменить
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Оплата через ЮКассу. Автоматическое списание каждый месяц.</p>
      </div>
    </div>
  );
}
