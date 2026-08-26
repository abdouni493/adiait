"use client";

import { create } from "zustand";
import {
  findByLogin,
  rememberSession,
  rememberedSession,
  upsertAccount,
  type DemoAccount,
} from "@/lib/demo/accounts";

export type Role = "admin" | "reception" | "student" | "teacher" | "parent";

export interface SessionUser {
  id: string;
  name: string;
  /** The account's login name — the email when no username was recorded. */
  username: string;
  email: string;
  role: Role;
  /** Row this account owns in students / teachers / parents / reception_staff.
   *  Accounts created by the app use the same id for both, so they match. */
  entityId?: string;
}

function toSessionUser(account: DemoAccount): SessionUser {
  return {
    id: account.id,
    name: account.fullName || account.email,
    username: account.username || account.email,
    email: account.email,
    role: account.role,
    entityId: account.entityId ?? account.id,
  };
}

interface SessionState {
  user: SessionUser | null;
  hydrated: boolean;
  /** Signs in with a login (email OR username) and a password. */
  signIn: (login: string, password: string) => Promise<SessionUser>;
  /** Patches the signed-in account (the portals let people rename themselves)
   *  and writes the change through to the demo account registry. */
  updateUser: (fields: Partial<SessionUser>) => void;
  logout: () => Promise<void>;
  setHydrated: () => void;
  /** Restores the session saved in this browser. */
  initSession: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  hydrated: false,

  signIn: async (login, password) => {
    const account = findByLogin(login);
    if (!account || account.password !== password) {
      throw new Error("Identifiants invalides");
    }
    const user = toSessionUser(account);
    rememberSession(account.id);
    set({ user, hydrated: true });
    return user;
  },

  updateUser: (fields) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...fields };
    set({ user: next });

    const account = findByLogin(current.email) ?? findByLogin(current.username);
    if (!account) return;
    upsertAccount({
      ...account,
      fullName: next.name,
      username: next.username,
      email: next.email,
    });
  },

  logout: async () => {
    rememberSession(null);
    set({ user: null });
  },

  setHydrated: () => set({ hydrated: true }),

  /**
   * LA SESSION SURVIT AU RECHARGEMENT.
   *
   * Elle est relue depuis le navigateur, jamais depuis un serveur : la
   * démonstration n'en a pas. Un registre vidé à la main rend simplement une
   * page de connexion, ce qui est le bon comportement.
   */
  initSession: async () => {
    const account = rememberedSession();
    set({ user: account ? toSessionUser(account) : null, hydrated: true });
  },
}));
