import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from '@store/authStore';
import { Loader2, Mountain } from 'lucide-react';

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    console.log('🚀 App: запускаю initialize...');
    initialize().then(() => {
      console.log('✅ App: initialize завершён, isAuthenticated =', useAuthStore.getState().isAuthenticated);
      setReady(true);
    });
  }, []);

  console.log('🔄 App render: ready =', ready, 'isAuthenticated =', isAuthenticated);

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-900 flex flex-col items-center justify-center">
        <div className="flex items-center gap-3 mb-6">
          <Mountain className="w-8 h-8 text-accent-400" />
          <span className="text-xl font-bold text-white">К2 Платформа</span>
        </div>
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}