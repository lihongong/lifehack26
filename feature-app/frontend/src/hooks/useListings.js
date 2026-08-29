import { useEffect, useState } from "react";
import { getListings } from "../api/listingsApi.js";
export function useListings(filters) {
  const [state, setState] = useState({ listings: [], loading: true, error: null });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    const refresh = () => getListings(filters)
      .then((data) => active && setState({ listings: data.listings, loading: false, error: null }))
      .catch((error) => active && setState((current) => ({ ...current, loading: false, error })));
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [filters]);
  return state;
}
