/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Vite dev mode flag — true при `vite dev`, false при `vite build`. */
  readonly DEV: boolean;
  /** Vite prod mode flag — true при production build. */
  readonly PROD: boolean;
  /** "development" | "production" | пользовательский режим. */
  readonly MODE: string;
  /** Базовый URL приложения. */
  readonly BASE_URL: string;
  /** SSR флаг. */
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
