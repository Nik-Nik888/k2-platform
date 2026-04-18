import { NavLink, useLocation } from 'react-router-dom';
import { useUiStore } from '@store/uiStore';
import {
  LayoutDashboard,
  Users,
  Box,
  PanelTop,
  Calculator,
  FileText,
  Warehouse,
  CreditCard,
  Wallet,
  Settings,
  ChevronLeft,
  X,
  Mountain,
  Database,
  Columns3,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Главная', path: '/', icon: LayoutDashboard },
  { label: 'CRM', path: '/crm', icon: Users },
  { label: '3D Визуализатор', path: '/visualizer', icon: Box },
  { label: 'Остекление', path: '/glazing', icon: PanelTop },
  { label: 'Калькулятор', path: '/calculator', icon: Calculator },
  { label: 'Сметы', path: '/estimates', icon: FileText },
  { label: 'Материалы', path: '/materials', icon: Database },
  { label: 'Склад', path: '/warehouse', icon: Warehouse },
  { label: 'Шкафы', path: '/cabinet', icon: Columns3 },
  { label: 'Рассрочка', path: '/installments', icon: Wallet },
  { label: 'Биллинг', path: '/billing', icon: CreditCard },
];

const BOTTOM_ITEMS = [
  { label: 'Настройки', path: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, toggleCollapse, closeSidebar } = useUiStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-brand-900 text-white
          flex flex-col transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:relative lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-white/10">
          <Mountain className="w-7 h-7 text-accent-400 shrink-0" />
          {!sidebarCollapsed && (
            <span className="text-lg font-bold tracking-tight whitespace-nowrap">
              К2 Платформа
            </span>
          )}
          {/* Mobile close */}
          <button
            onClick={closeSidebar}
            className="ml-auto lg:hidden p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Desktop collapse */}
          <button
            onClick={toggleCollapse}
            className="ml-auto hidden lg:flex p-1 rounded hover:bg-white/10"
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-150
                  ${isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/8'
                  }
                `}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom links */}
        <div className="px-3 py-3 border-t border-white/10">
          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebar}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                  text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </div>
      </aside>
    </>
  );
}
