import { useEffect, useState } from "react";
import { getBuffetFeed } from "../api/buffetApi.js";

export function useBuffets(filters) {
  const [state, setState] = useState({ posts: [], zones: [], loading: true, error: null });
  useEffect(() => {
    let active = true;
    const load = () => getBuffetFeed(filters)
      .then((data) => active && setState({ ...data, loading: false, error: null }))
      .catch((error) => active && setState((current) => ({ ...current, posts: [], loading: false, error })));
    setState((current) => ({ ...current, loading: true, error: null }));
    load();
    const refresh = setInterval(load, 30_000);
    return () => { active = false; clearInterval(refresh); };
  }, [filters]);
  return state;
}
