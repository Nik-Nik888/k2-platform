import { create } from 'zustand';
import { supabase } from '@lib/supabase';
import type { User, Organization } from '@shared/types';

// ── Утилита: логирование только в DEV ──────────────────
const log = {
  error: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.error(...args);
  },
};

interface AuthState {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, orgName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

// ── Транслитерация кириллицы для slug ──────────────────
function slugify(orgName: string): string {
  const slug = orgName
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => {
      const map: Record<string, string> = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
        'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      };
      return map[c] ?? c;
    })
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
  return slug || 'company-' + Date.now();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organization: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          const { data: org } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', profile.org_id)
            .single();

          set({
            user: profile,
            organization: org,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      }

      set({ isLoading: false });
    } catch (err) {
      log.error('Ошибка инициализации:', err);
      set({ isLoading: false });
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message === 'Invalid login credentials') {
        return { error: 'Неверный email или пароль' };
      }
      return { error: error.message };
    }

    await get().initialize();
    return { error: null };
  },

  signUp: async (email, password, name, orgName) => {
    // 1. Регистрируем в Supabase Auth
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (error.message.includes('already registered')) {
        return { error: 'Этот email уже зарегистрирован' };
      }
      return { error: error.message };
    }
    if (!data.user) return { error: 'Не удалось создать аккаунт' };

    // 2. Атомарная регистрация организации + профиля + подписки через RPC.
    //    Если что-то упадёт в середине — транзакция откатится целиком
    //    и не останется осиротевших записей.
    const { error: rpcError } = await supabase.rpc('register_organization', {
      p_user_id: data.user.id,
      p_email: email,
      p_name: name,
      p_org_name: orgName,
      p_slug: slugify(orgName),
    });

    if (rpcError) {
      log.error('Ошибка регистрации организации:', rpcError);
      return { error: 'Не удалось создать организацию: ' + rpcError.message };
    }

    // 3. Загружаем свежие данные
    await get().initialize();
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, organization: null, isAuthenticated: false });
  },
}));
