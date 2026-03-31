import { FileText, Download, Plus, Eye, Copy } from 'lucide-react';

const DEMO_ESTIMATES = [
  { id: '1', client: 'Иванов С.', type: 'Балкон 3м', total: '89 500', version: 2, date: '29 мар 2026', status: 'Подписана' },
  { id: '2', client: 'Петрова Е.', type: 'Лоджия 6м', total: '—', version: 1, date: '27 мар 2026', status: 'Черновик' },
];

export function EstimatesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сметы</h1>
          <p className="text-sm text-gray-500 mt-1">Формирование PDF и Excel смет</p>
        </div>
        <button className="btn-primary">
          <Plus className="w-4 h-4" /> Новая смета
        </button>
      </div>

      {/* Estimates list */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-surface-50">
              <th className="px-5 py-3 font-medium">Клиент</th>
              <th className="px-5 py-3 font-medium">Объект</th>
              <th className="px-5 py-3 font-medium">Сумма</th>
              <th className="px-5 py-3 font-medium">Версия</th>
              <th className="px-5 py-3 font-medium">Статус</th>
              <th className="px-5 py-3 font-medium">Дата</th>
              <th className="px-5 py-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {DEMO_ESTIMATES.map((est) => (
              <tr key={est.id} className="hover:bg-surface-50 transition-colors">
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{est.client}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600">{est.type}</td>
                <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">
                  {est.total === '—' ? '—' : `${est.total} ₽`}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-500">v{est.version}</td>
                <td className="px-5 py-3.5">
                  <span className={`badge ${est.status === 'Подписана' ? 'badge-green' : 'badge-gray'}`}>
                    {est.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-500">{est.date}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded hover:bg-surface-100" title="Просмотр">
                      <Eye className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-surface-100" title="Скачать PDF">
                      <Download className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-surface-100" title="Дублировать">
                      <Copy className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Template section */}
      <div className="card p-6 text-center border-dashed border-2">
        <FileText className="w-10 h-10 text-gray-300 mx-auto" />
        <h3 className="text-sm font-semibold text-gray-700 mt-3">Шаблон сметы</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Сметы формируются автоматически из данных калькулятора и модуля остекления.
          Разделы: остекление, отделка, утепление, электрика, мебель, крыша, монтаж.
        </p>
      </div>
    </div>
  );
}
