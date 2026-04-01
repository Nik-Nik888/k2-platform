import { create } from 'zustand';
import { supabase } from '@lib/supabase';
import type { User, Organization } from '@shared/types';

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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organization: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔑 Session:', session ? 'есть' : 'нет');

      if (session?.user) {
        console.log('👤 Auth user id:', session.user.id);

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        console.log('📋 Profile:', profile, 'Error:', profileError);

        if (profile) {
          const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', profile.org_id)
            .single();

          console.log('🏢 Org:', org, 'Error:', orgError);

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
      console.error('Ошибка инициализации:', err);
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

    // 2. Получаем тариф "Профи" для trial
    const { data: plan } = await supabase
      .from('plans')
      .select('id')
      .eq('name', 'Профи')
      .single();

    // 3. Создаём организацию
    const slug = orgName.toLowerCase()
      .replace(/[а-яё]/g, (c) => {
        const map: Record<string, string> = {
          'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
          'з':'z','и':'i','й':'j','к':'k','л':'l','м':'m','н':'n','о':'o',
          'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c',
          'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        };
        return map[c] ?? c;
      })
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        slug: slug || 'company-' + Date.now(),
        plan_id: plan?.id ?? null,
      })
      .select()
      .single();

    if (orgError) {
      console.error('Ошибка создания организации:', orgError);
      return { error: 'Не удалось создать организацию: ' + orgError.message };
    }

    // 4. Создаём профиль пользователя
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email,
        name,
        org_id: org.id,
        role: 'owner',
      });

    if (profileError) {
      console.error('Ошибка создания профиля:', profileError);
      return { error: 'Не удалось создать профиль: ' + profileError.message };
    }

    // 5. Создаём trial-подписку
    await supabase
      .from('subscriptions')
      .insert({
        org_id: org.id,
        plan_id: plan?.id,
        status: 'trial',
      });

    // 6. Загружаем данные
    await get().initialize();
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, organization: null, isAuthenticated: false });
  },
}));
