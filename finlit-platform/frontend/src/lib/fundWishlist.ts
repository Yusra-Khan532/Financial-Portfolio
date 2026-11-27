// Task #375 (24 Nov 2026, the team's picture of the Mutual Funds page: "add a wishlist button here and a person can add in their wishlist a MF or an ETF
// and they can see it from here"). The schemes a member keeps, mutual funds and ETFs alike (both are AMFI schemes with a code), newest first, at most
// 100. Saved on the server beside the stock watchlists (PUT /api/me/fund-wishlist; GET /api/me/state gives watchlist.funds), so it follows the member
// to every device. Any signed-in member (everything stays free); a visitor is asked to sign in.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "./api";
import { useAuthMaybe } from "./auth";
import type { Facts, FundRow, PeerStats } from "./mf";

export const WISH_MAX = 100;
const key = (uid: string | null) => ["fund-wishlist", uid] as const;

/** The codes, newest first: a new one goes to the front; one already there is taken out. At most WISH_MAX (the oldest drop off). */
export function toggleCode(codes: number[], code: number): number[] {
  return codes.includes(code) ? codes.filter((c) => c !== code) : [code, ...codes].slice(0, WISH_MAX);
}

/** The member's wishlist and a toggle. `signedIn` false: there is nothing to keep, and `toggle` reports "sign-in". */
export function useFundWishlist() {
  const auth = useAuthMaybe();                              // a page drawn without the sign-in context (a test, a preview) acts as for a visitor
  const uid = auth?.user?.id ?? null;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: key(uid), enabled: !!uid, staleTime: 60_000, retry: false,
    queryFn: async () => {
      const s = await apiGet<{ watchlist?: { funds?: unknown } }>("/api/me/state");
      const f = s.watchlist?.funds;
      return Array.isArray(f) ? f.filter((c): c is number => Number.isInteger(c) && c > 0) : [];
    },
  });
  const codes = q.data ?? [];
  const save = useMutation({
    mutationFn: (next: number[]) => apiSend("PUT", "/api/me/fund-wishlist", { codes: next }),
    onMutate: async (next) => { await qc.cancelQueries({ queryKey: key(uid) }); const was = qc.getQueryData<number[]>(key(uid)); qc.setQueryData(key(uid), next); return { was }; },
    onError: (_e, _n, c) => { if (c) qc.setQueryData(key(uid), c.was); },
  });
  /** "added" / "removed", "full" when 100 are kept, "sign-in" for a visitor; "error" comes back through `failed`. */
  const toggle = (code: number): "added" | "removed" | "full" | "sign-in" => {
    if (!uid) return "sign-in";
    const had = codes.includes(code);
    if (!had && codes.length >= WISH_MAX) return "full";
    save.mutate(toggleCode(codes, code));
    return had ? "removed" : "added";
  };
  return { signedIn: !!uid, ready: !uid || q.isSuccess, codes, has: (c: number) => codes.includes(c), toggle, failed: save.isError, loading: !!uid && q.isLoading };
}

/** The list rows of the kept schemes, in the kept order (GET /api/mf/rows). */
export function useWishRows(codes: number[], on: boolean) {
  return useQuery({
    queryKey: ["mf-rows", codes.join(",")], enabled: on && codes.length > 0, staleTime: 5 * 60_000,
    queryFn: () => apiGet<{ items: FundRow[]; peers: Record<string, PeerStats> } & Facts>(`/api/mf/rows?codes=${codes.join(",")}`),
  });
}
