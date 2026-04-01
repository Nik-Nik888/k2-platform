import { Menu, Bell, Search, LogOut } from 'lucide-react';
import { useUiStore } from '@store/uiStore';
import { useAuthStore } from '@store/authStore';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { toggleSidebar } = useUiStore();
  const { user, organization, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Первые буквы имени для аватарки
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-surface-200 px-4 lg:px-6 flex items-center gap-4">
      {/* Mobile hamburger */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-100"
      >
        <Menu className="w-5 h-5 text-gray-600" />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск клиентов, заказов..."
            className="input pl-10 py-2 text-sm bg-surface-50"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-surface-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent-500 rounded-full" />
        </button>

        {/* User info */}
        <div className="flex items-center gap-3 pl-3 border-l border-surface-200">
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold">
            {initials}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900">
              {organization?.name ?? 'Загрузка...'}
            </p>
            <p className="text-xs text-gray-500">{user?.name ?? ''}</p>
          </div>

          {/* Logout */}
          <button
            onClick={handleSignOut}
            title="Выйти"
            className="p-2 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <LogOut className="w-4 h-4 text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </header>
  );
}
