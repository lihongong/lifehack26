import { useEffect, useState } from "react";
import { getListings } from "../api/listingsApi.js";
export function useListings(filters) {
  const [state, setState] = useState({ listings: [], loading: true, error: null });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    getListings(filters)
      .then((data) => active && setState({ listings: data.listings, loading: false, error: null }))
      .catch((error) => active && setState({ listings: [], loading: false, error }));
    return () => {
      active = false;
    };
  }, [filters]);
  return state;
}
