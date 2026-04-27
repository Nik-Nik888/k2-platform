import { Building2, Users, Palette, Bell } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-sm text-gray-500 mt-1">Настройки организации и платформы</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Nav */}
        <nav className="space-y-1">
          {[
            { icon: Building2, label: 'Организация', active: true },
            { icon: Users, label: 'Сотрудники', active: false },
            { icon: Palette, label: 'Брендинг', active: false },
            { icon: Bell, label: 'Уведомления', active: false },
          ].map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-surface-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="card p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Организация</h2>
            <p className="text-sm text-gray-500 mt-1">Основная информация о компании</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Название</label>
              <input type="text" defaultValue="К2 Балкон" className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Телефон</label>
              <input type="tel" defaultValue="+7 (831) 123-45-67" className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email</label>
              <input type="email" defaultValue="info@k2balkon.ru" className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Город</label>
              <input type="text" defaultValue="Нижний Новгород" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Адрес</label>
              <input type="text" placeholder="Юридический адрес" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">ИНН</label>
              <input type="text" placeholder="1234567890" className="input" />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
