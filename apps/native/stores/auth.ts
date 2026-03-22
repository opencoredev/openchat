import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "openchat_session_data";

export interface SessionData {
  /** Better Auth session token */
  token: string;
  /** Better Auth user ID (used as externalId in Convex) */
  userId: string;
  email?: string;
  name?: string;
  image?: string;
}

interface AuthState {
  sessionToken: string | null;
  sessionData: SessionData | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Called once on app start to rehydrate any persisted session. */
  initialize: () => Promise<void>;
  /** Called after a successful OAuth sign-in. */
  setSession: (data: SessionData) => Promise<void>;
  /** Clears the local session. */
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  sessionToken: null,
  sessionData: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const data: SessionData = JSON.parse(raw);
        set({ sessionToken: data.token, sessionData: data, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setSession: async (data) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(data));
    set({ sessionToken: data.token, sessionData: data, isAuthenticated: true, isLoading: false });
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    set({ sessionToken: null, sessionData: null, isAuthenticated: false, isLoading: false });
  },
}));
