import { create } from 'zustand';
import type { AuthSessionState } from '../data/client';
import { api } from '../data';

interface AuthStoreState {
  session: AuthSessionState | null;
  initialized: boolean;
  lastActivityAt: number;
  idleWarningVisible: boolean;
  initialize: () => Promise<void>;
  setSession: (session: AuthSessionState | null) => void;
  touchActivity: () => void;
  setIdleWarningVisible: (v: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  session: null,
  initialized: false,
  lastActivityAt: Date.now(),
  idleWarningVisible: false,

  initialize: async () => {
    try {
      const sess = await api.getCurrentSession();
      set({ session: sess, initialized: true, lastActivityAt: Date.now(), idleWarningVisible: false });
    } catch {
      set({ session: null, initialized: true });
    }
  },

  setSession: (session) =>
    set({
      session,
      initialized: true,
      lastActivityAt: Date.now(),
      idleWarningVisible: false,
    }),

  touchActivity: () =>
    set({
      lastActivityAt: Date.now(),
      idleWarningVisible: false,
    }),

  setIdleWarningVisible: (v) => set({ idleWarningVisible: v }),

  signOut: async () => {
    await api.signOut();
    set({ session: null, idleWarningVisible: false });
  },
}));
