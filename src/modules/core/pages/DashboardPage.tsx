import {
  Users,
  FileText,
  TrendingUp,
  Clock,
  ArrowUpRight,
} from 'lucide-react';

const STATS = [
  { label: 'Активных заказов', value: '12', change: '+3 за неделю', icon: FileText, color: 'bg-blue-500' },
  { label: 'Клиентов', value: '47', change: '+5 за месяц', icon: Users, color: 'bg-emerald-500' },
  { label: 'Выручка (март)', value: '485 000 ₽', change: '+12%', icon: TrendingUp, color: 'bg-amber-500' },
  { label: 'Ср. время заказа', value: '14 дней', change: '-2 дня', icon: Clock, color: 'bg-purple-500' },
];

const RECENT_ORDERS = [
  { client: 'Иванов С.', type: 'Балкон 3м', status: 'Договор', amount: '89 500 ₽', date: '29 мар' },
  { client: 'Петрова Е.', type: 'Лоджия 6м', status: 'Расчёт', amount: '—', date: '27 мар' },
  { client: 'Козлов Д.', type: 'Угловой балкон', status: 'Замер', amount: '—', date: '26 мар' },
  { client: 'Смирнова А.', type: 'Балкон 2.8м', status: 'Заявка', amount: '—', date: '28 мар' },
];

export function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Главная</h1>
        <p className="text-sm text-gray-500 mt-1">Обзор за март 2026</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-2.5 rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-xs text-emerald-600 font-medium mt-3 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                {stat.change}
              </p>
            </div>
          );
        })}
      </div>

      {/* Recent orders */}
      <div className="card">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="font-semibold text-gray-900">Последние заказы</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Клиент</th>
                <th className="px-5 py-3 font-medium">Тип</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3 font-medium">Сумма</th>
                <th className="px-5 py-3 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {RECENT_ORDERS.map((order, i) => (
                <tr key={i} className="hover:bg-surface-50 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{order.client}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{order.type}</td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${
                      order.status === 'Договор' ? 'badge-green' :
                      order.status === 'Расчёт' ? 'badge-blue' :
                      order.status === 'Замер' ? 'badge-orange' :
                      'badge-gray'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-900 font-medium">{order.amount}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
