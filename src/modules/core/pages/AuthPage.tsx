import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@store/authStore';
import { Mountain, Loader2, Eye, EyeOff } from 'lucide-react';

export function AuthPage() {
  const { signIn, signUp } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    orgName: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isRegister) {
      if (!form.name.trim()) { setError('Введите ваше имя'); setLoading(false); return; }
      if (!form.orgName.trim()) { setError('Введите название компании'); setLoading(false); return; }
      const { error } = await signUp(form.email, form.password, form.name.trim(), form.orgName.trim());
      if (error) setError(error);
    } else {
      const { error } = await signIn(form.email, form.password);
      if (error) setError(error);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4">
            <Mountain className="w-8 h-8 text-accent-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">К2 Платформа</h1>
          <p className="text-white/50 text-sm mt-1">Автоматизация балконного бизнеса</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">
            {isRegister ? 'Регистрация' : 'Вход в систему'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isRegister
              ? 'Создайте аккаунт для вашей компании'
              : 'Войдите в свой аккаунт'}
          </p>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Register fields */}
            {isRegister && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    Ваше имя
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Николай Щербаков"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    Название компании
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="К2 Балкон"
                    value={form.orgName}
                    onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Email
              </label>
              <input
                type="email"
                className="input"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={isRegister ? 'Минимум 6 символов' : 'Ваш пароль'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Подождите...</>
              ) : isRegister ? (
                'Создать аккаунт'
              ) : (
                'Войти'
              )}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              {isRegister ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}{' '}
              <button
                onClick={() => { setIsRegister(!isRegister); setError(null); }}
                className="text-brand-600 font-medium hover:underline"
              >
                {isRegister ? 'Войти' : 'Зарегистрироваться'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6">
          К2 Платформа © 2026 · Нижний Новгород
        </p>
      </div>
    </div>
  );
}