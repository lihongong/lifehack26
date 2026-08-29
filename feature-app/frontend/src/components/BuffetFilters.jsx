import { Search } from "lucide-react";
import { SelectControl } from "./ListingFilters.jsx";

export default function BuffetFilters({ filters, zones, onChange }) {
  return (
    <div className="filters">
      <label className="search-field">
        <Search aria-hidden="true" size={20} strokeWidth={2.1} />
        <input type="search" value={filters.query} onChange={(event) => onChange({ query: event.target.value })} placeholder="Search Buffet Posts" aria-label="Search Buffet Posts" />
      </label>
      <div className="filter-row">
        <SelectControl label="NUS Zone" value={filters.zone} onChange={(event) => onChange({ zone: event.target.value })}>
          <option value="all">All zones</option>
          {zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}
          <option value="unclear">Location unclear</option>
        </SelectControl>
        <SelectControl label="Freshness" value={filters.freshness} onChange={(event) => onChange({ freshness: event.target.value })}>
          <option value="active">All active</option>
          <option value="30">Last 30 minutes</option>
          <option value="60">Last 60 minutes</option>
        </SelectControl>
      </div>
    </div>
  );
}
