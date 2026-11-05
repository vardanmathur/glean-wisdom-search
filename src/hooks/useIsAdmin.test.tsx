import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { useIsAdmin } from "./useIsAdmin";

const wrap = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("useIsAdmin", () => {
  beforeEach(() => {
    auth.user = null;
    rpc.mockReset();
  });

  it("is never admin when signed out, even if a true answer is sitting in the cache", () => {
    const client = new QueryClient();
    client.setQueryData(["is-admin", null], true);
    client.setQueryData(["is-admin", "user-a"], true);
    const { result } = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    expect(result.current).toEqual({ isAdmin: false, loading: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps one cached answer per user id, so a different user never inherits it", async () => {
    const client = new QueryClient();
    rpc.mockResolvedValue({ data: true, error: null });
    auth.user = { id: "user-a" };
    const a = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    await waitFor(() => expect(a.result.current.isAdmin).toBe(true));

    rpc.mockResolvedValue({ data: false, error: null });
    auth.user = { id: "user-b" };
    const b = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.isAdmin).toBe(false);
  });

  it("treats an error from the role check as not admin", async () => {
    const client = new QueryClient();
    rpc.mockResolvedValue({ data: true, error: { message: "boom" } });
    auth.user = { id: "user-a" };
    const { result } = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("shares one request between many components", async () => {
    const client = new QueryClient();
    rpc.mockResolvedValue({ data: true, error: null });
    auth.user = { id: "user-a" };
    const first = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    const second = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    await waitFor(() => expect(first.result.current.isAdmin).toBe(true));
    await waitFor(() => expect(second.result.current.isAdmin).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
