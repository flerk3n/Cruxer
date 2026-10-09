"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type BillingOverview, type User } from "@/lib/api";

type AccountContextValue = {
  user: User | null;
  billing: BillingOverview | null;
  /** Re-reads session and plan/usage, e.g. after a generation or checkout. */
  refresh: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue>({ user: null, billing: null, refresh: async () => undefined });

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const refresh = useCallback(async () => {
    const [session, overview] = await Promise.allSettled([api.session(), api.getBilling()]);
    if (session.status === "fulfilled") setUser(session.value.user);
    if (overview.status === "fulfilled") setBilling(overview.value);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ user, billing, refresh }), [user, billing, refresh]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
