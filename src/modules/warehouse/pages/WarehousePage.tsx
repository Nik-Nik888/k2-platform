import { Warehouse, Package, AlertTriangle, TrendingDown, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

const STOCK_ITEMS = [
  { name: 'Вагонка сосна 12.5×96', category: 'Отделка', qty: 48, unit: 'м²', min: 20, status: 'ok' },
  { name: 'Пеноплекс 50мм', category: 'Утепление', qty: 12, unit: 'м²', min: 15, status: 'low' },
  { name: 'Панель ПВХ белая 250мм', category: 'Отделка', qty: 64, unit: 'шт', min: 30, status: 'ok' },
  { name: 'Брус 40×40 сосна', category: 'Каркас', qty: 24, unit: 'м', min: 10, status: 'ok' },
  { name: 'Пена монтажная 750мл', category: 'Расходники', qty: 3, unit: 'шт', min: 5, status: 'low' },
  { name: 'Саморез 3.5×35', category: 'Крепёж', qty: 500, unit: 'шт', min: 200, status: 'ok' },
  { name: 'Пенофол 5мм', category: 'Утепление', qty: 8, unit: 'м²', min: 10, status: 'low' },
];

export function WarehousePage() {
  const lowStock = STOCK_ITEMS.filter(i => i.status === 'low');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Склад</h1>
          <p className="text-sm text-gray-500 mt-1">Остатки и движение материалов</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm">
            <ArrowDownToLine className="w-4 h-4" /> Поступление
          </button>
          <button className="btn-secondary text-sm">
            <ArrowUpFromLine className="w-4 h-4" /> Списание
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="p-2.5 bg-blue-50 rounded-lg">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{STOCK_ITEMS.length}</p>
            <p className="text-xs text-gray-500">Позиций на складе</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-2.5 bg-amber-50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{lowStock.length}</p>
            <p className="text-xs text-gray-500">Ниже минимума</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="p-2.5 bg-emerald-50 rounded-lg">
            <TrendingDown className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">12</p>
            <p className="text-xs text-gray-500">Движений за неделю</p>
          </div>
        </div>
      </div>

      {/* Stock table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-surface-50">
              <th className="px-5 py-3 font-medium">Материал</th>
              <th className="px-5 py-3 font-medium">Категория</th>
              <th className="px-5 py-3 font-medium text-right">Остаток</th>
              <th className="px-5 py-3 font-medium text-right">Минимум</th>
              <th className="px-5 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {STOCK_ITEMS.map((item, i) => (
              <tr key={i} className={`hover:bg-surface-50 transition-colors ${item.status === 'low' ? 'bg-amber-50/50' : ''}`}>
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{item.name}</td>
                <td className="px-5 py-3.5 text-sm text-gray-500">{item.category}</td>
                <td className="px-5 py-3.5 text-sm text-right font-medium">
                  {item.qty} <span className="text-gray-400">{item.unit}</span>
                </td>
                <td className="px-5 py-3.5 text-sm text-right text-gray-400">
                  {item.min} {item.unit}
                </td>
                <td className="px-5 py-3.5">
                  {item.status === 'low' ? (
                    <span className="badge badge-orange">Мало</span>
                  ) : (
                    <span className="badge badge-green">Ок</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
