import { create } from "zustand";
import { getStoredToken, storeToken, clearToken } from "../lib/auth";

interface AuthState {
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Called once on app start to rehydrate any persisted session. */
  initialize: () => Promise<void>;
  /** Called after a successful OAuth sign-in to persist the session token. */
  setSession: (token: string) => Promise<void>;
  /** Clears the local session (sign-out). */
  clearSession: () => Promise<void>;
}

/**
 * Lightweight auth state store.
 * Uses expo-secure-store (via lib/auth.ts helpers) for persistence.
 * Import `useAuthStore` anywhere in the app to read/update auth state.
 */
export const useAuthStore = create<AuthState>((set) => ({
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    const token = await getStoredToken();
    set({
      sessionToken: token,
      isAuthenticated: !!token,
      isLoading: false,
    });
  },

  setSession: async (token) => {
    await storeToken(token);
    set({ sessionToken: token, isAuthenticated: true, isLoading: false });
  },

  clearSession: async () => {
    await clearToken();
    set({ sessionToken: null, isAuthenticated: false, isLoading: false });
  },
}));
