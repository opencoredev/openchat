/**
 * OpenRouter API Key Store
 *
 * Manages the OpenRouter API key connection state.
 * Uses Zustand for state management with devtools for debugging.
 * 
 * SECURITY: The actual API key is stored server-side only (encrypted in Convex).
 * The client only tracks whether a key is configured, not the key value itself.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  clearOAuthStorage,
  exchangeCodeForKey,
  getStoredCodeVerifier,
  initiateOAuthFlow,
  validateState,
} from "../lib/openrouter-oauth";

// ============================================================================
// Types
// ============================================================================

interface OpenRouterState {
	// State
	hasApiKey: boolean;
	isLoading: boolean;
	error: string | null;

	// Actions
	setApiKey: (key: string) => Promise<void>;
	clearApiKey: () => Promise<void>;
	checkApiKeyStatus: () => Promise<void>;
	initiateLogin: (callbackUrl: string) => Promise<void>;
	handleCallback: (code: string, state: string | null) => Promise<boolean>;
	clearError: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useOpenRouterStore = create<OpenRouterState>()(
  devtools(
    (set) => ({
      // Initial state - hasApiKey starts false, will be fetched from server
      hasApiKey: false,
      isLoading: false,
      error: null,

      // Check if user has API key configured (fetches from server)
      checkApiKeyStatus: async () => {
        try {
          const response = await fetch("/api/openrouter-key");
          if (response.ok) {
            const data = await response.json();
            set({ hasApiKey: data.hasKey ?? false }, false, "openrouter/checkApiKeyStatus");
          }
        } catch {
          // Silently fail - user may not be authenticated
        }
      },

      // Set API key directly (stores on server only)
      setApiKey: async (key) => {
        set({ isLoading: true, error: null }, false, "openrouter/setApiKey");
        try {
          const response = await fetch("/api/openrouter-key", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ apiKey: key }),
          });
          if (!response.ok) {
            throw new Error("Failed to store API key");
          }
          set({ hasApiKey: true, isLoading: false, error: null }, false, "openrouter/setApiKey");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to store API key";
          set({ isLoading: false, error: message }, false, "openrouter/setApiKeyError");
          throw error;
        }
      },

      // Clear API key (logout)
      clearApiKey: async () => {
        set({ isLoading: true, error: null }, false, "openrouter/clearApiKey");
        try {
          const response = await fetch("/api/openrouter-key", { method: "DELETE" });
          if (!response.ok) {
            throw new Error("Failed to remove API key");
          }
          set({ hasApiKey: false, isLoading: false, error: null }, false, "openrouter/clearApiKey");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to remove API key";
          set({ isLoading: false, error: message }, false, "openrouter/clearApiKeyError");
          throw error;
        }
      },

      // Initiate OAuth login flow
      initiateLogin: async (callbackUrl) => {
        set({ isLoading: true, error: null }, false, "openrouter/initiateLogin");
        try {
          await initiateOAuthFlow(callbackUrl);
          // Note: This won't resolve as the page will redirect
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to initiate login";
          set({ isLoading: false, error: message }, false, "openrouter/initiateLoginError");
        }
      },

      // Handle OAuth callback
      handleCallback: async (code, state) => {
        set({ isLoading: true, error: null }, false, "openrouter/handleCallback");

        try {
          // Validate state to prevent CSRF attacks
          if (!validateState(state)) {
            throw new Error("Invalid state parameter. Please try again.");
          }

          // Get stored code verifier
          const codeVerifier = getStoredCodeVerifier();
          if (!codeVerifier) {
            throw new Error("Missing code verifier. Please restart the login process.");
          }

          // Exchange code for API key
          const apiKey = await exchangeCodeForKey(code, codeVerifier);

          // Clear OAuth storage after successful exchange
          clearOAuthStorage();

          try {
            const response = await fetch("/api/openrouter-key", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ apiKey }),
            });
            if (!response.ok) {
              throw new Error("Failed to store API key");
            }
            set(
              { hasApiKey: true, isLoading: false, error: null },
              false,
              "openrouter/handleCallbackSuccess",
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Authentication failed";
            set({ isLoading: false, error: message }, false, "openrouter/handleCallbackError");
            return false;
          }

          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Authentication failed";
          set({ isLoading: false, error: message }, false, "openrouter/handleCallbackError");
          return false;
        }
      },

      // Clear error state
      clearError: () => set({ error: null }, false, "openrouter/clearError"),
    }),
    { name: "openrouter-store" },
  ),
);

// ============================================================================
// Convenience Hook
// ============================================================================

/**
 * Hook for accessing OpenRouter API key state and actions.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { hasApiKey, initiateLogin, clearApiKey } = useOpenRouterKey();
 *
 *   if (!hasApiKey) {
 *     return <button onClick={() => initiateLogin("/callback")}>Connect</button>;
 *   }
 *
 *   return <button onClick={clearApiKey}>Disconnect</button>;
 * }
 * ```
 */
export function useOpenRouterKey() {
  return useOpenRouterStore();
}
