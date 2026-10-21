import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import api from "@/lib/axiosInstance";

export interface ProjectSearchResult {
  id: string;
  kind: "space" | "screen";
  title: string;
  /** When the project was created / the recording started (ISO). */
  at: string;
  /** Why it matched when the title didn't: a take's title or a person. */
  match: string | null;
}

/** Wait this long after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Server-side project search (meeting projects + screen recordings). An empty
 * query returns the most recent few. Keeps the previous results on screen
 * while the next query loads, so the list doesn't flash empty as you type.
 */
export const useProjectSearch = (query: string, enabled: boolean) => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const trimmed = query.trim();
  const [debounced, setDebounced] = useState(trimmed);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [trimmed]);

  return useQuery({
    queryKey: ["project-search", debounced],
    queryFn: async () => {
      const { data } = await api.get("/search", { params: { q: debounced } });
      return data.data.results as ProjectSearchResult[];
    },
    enabled: enabled && isLoaded && !!isSignedIn,
    staleTime: 15000,
    placeholderData: keepPreviousData,
  });
};
