import { create } from "zustand";

export type AuthUser = {
  id: string;
  email: string;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        set({ user: null, loading: false });
        return;
      }
      const user = (await response.json()) as AuthUser;
      set({ user, loading: false });
    } catch (error) {
      set({
        user: null,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load session.",
      });
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        set({
          loading: false,
          error: body.message ?? "Unable to log in.",
        });
        return false;
      }
      const user = (await response.json()) as AuthUser;
      set({ user, loading: false });
      return true;
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to log in.",
      });
      return false;
    }
  },
  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        set({
          loading: false,
          error: body.message ?? "Unable to register.",
        });
        return false;
      }
      const user = (await response.json()) as AuthUser;
      set({ user, loading: false });
      return true;
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to register.",
      });
      return false;
    }
  },
  logout: async () => {
    set({ loading: true, error: null });
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      set({ user: null, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to log out.",
      });
    }
  },
}));
