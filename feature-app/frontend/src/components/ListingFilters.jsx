import { SearchControl, SelectControl } from "./ExchangePrimitives.jsx";

export default function ListingFilters({ filters, onChange }) {
  return (
    <div className="exchange-filters">
      <SearchControl
        label="Search listings"
        placeholder="Search listings"
        value={filters.query}
        onChange={(event) => onChange({ query: event.target.value })}
      />
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
