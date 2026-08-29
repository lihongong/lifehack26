import { ChevronDown, Search } from "lucide-react";

export function SelectControl({ label, value, onChange, children }) {
  return (
    <label className="select-control">
      <span className="select-label">{label}</span>
      <span className="select-shell">
        <select value={value} onChange={onChange} aria-label={label}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" size={17} strokeWidth={2.2} />
      </span>
    </label>
  );
}

export default function ListingFilters({ filters, onChange }) {
  return (
    <div className="filters">
      <label className="search-field">
        <Search aria-hidden="true" size={20} strokeWidth={2.1} />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder="Search listings"
          aria-label="Search listings"
        />
      </label>
      <div className="filter-row">
        <SelectControl
          label="Category"
          value={filters.category}
          onChange={(event) => onChange({ category: event.target.value })}
        >
          <option>All</option>
          <option>Study</option>
          <option>Room &amp; Living</option>
          <option>Transport</option>
          <option>Electronics</option>
        </SelectControl>
        <SelectControl
          label="Sort by"
          value={filters.sort}
          onChange={(event) => onChange({ sort: event.target.value })}
        >
          <option value="fresh">Freshest</option>
          <option value="price">Lowest price</option>
        </SelectControl>
      </div>
    </div>
  );
}
