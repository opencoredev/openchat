import { useEffect, type DependencyList, type EffectCallback } from "react";

/**
 * AGENTS.md Rule 1: Mount/unmount external side effects only (DOM listeners, third-party init).
 * Do not import `useEffect` from "react" in app code — use this or `useEffectOnDeps`.
 */
export function useMountEffect(effect: EffectCallback): void {
	useEffect(effect, []);
}

/**
 * AGENTS.md Rule 1: External side effects that legitimately depend on values changing
 * (Convex/auth sync, query-driven UI updates). Prefer derived state, event handlers, or
 * TanStack Query when possible. Call sites should include a short comment when non-obvious.
 */
export function useEffectOnDeps(effect: EffectCallback, deps: DependencyList): void {
	useEffect(effect, deps);
}
