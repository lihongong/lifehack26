import { CalendarDays, ChevronDown, RotateCcw, Search } from "lucide-react";

export function SelectControl({ label, value, onChange, options, empty, className = "" }) {
  return <label className={`select-control ${className}`.trim()}>
    <span className="control-label">{label}</span>
    <span className="select-shell">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {empty && <option value="">{empty}</option>}
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />
    </span>
  </label>;
}

export function DateControl({ label, value, onChange, min, max, required = false }) {
  return <label className="date-control">
    <span className="control-label">{label}</span>
    <span className="date-shell">
      <CalendarDays size={16} strokeWidth={2.1} aria-hidden="true" />
      <input required={required} type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} />
    </span>
  </label>;
}

export function PropertyFilterPanel({
  ariaLabel,
  title,
  hint,
  searchLabel,
  searchPlaceholder,
  values,
  onChange,
  categoryLabel,
  zoneLabel,
  fromLabel,
  toLabel,
  categories,
  zones,
  sortOptions,
  today,
}) {
  const activeCount = [values.query, values.category, values.zone, values.dateFrom, values.dateTo]
    .filter(Boolean).length;
  const advancedCount = [values.category, values.zone, values.dateFrom, values.dateTo].filter(Boolean).length;
  const clear = () => {
    for (const key of ["query", "category", "zone", "dateFrom", "dateTo"]) onChange(key, "");
  };

  return <div className="property-filter-panel" aria-label={ariaLabel}>
    <div className="filter-panel-heading">
      <div><strong>{title}</strong><span>{hint}</span></div>
      <button type="button" className="clear-filters" disabled={!activeCount} onClick={clear}>
        <RotateCcw size={14} aria-hidden="true" />Clear{activeCount ? ` (${activeCount})` : ""}
      </button>
    </div>
    <label className="search-field property-search">
      <Search size={18} aria-hidden="true" />
      <input aria-label={searchLabel} type="search" placeholder={searchPlaceholder} value={values.query} onChange={(event) => onChange("query", event.target.value)} />
    </label>
    <details className="more-property-filters">
      <summary><span>Category, zone and date</span>{advancedCount > 0 && <small>{advancedCount} active</small>}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="more-property-filter-content">
        <div className="filter-control-grid">
          <SelectControl label={categoryLabel} value={values.category} onChange={(value) => onChange("category", value)} options={categories} empty="All categories" />
          <SelectControl label={zoneLabel} value={values.zone} onChange={(value) => onChange("zone", value)} options={zones} empty="All zones" />
        </div>
        <fieldset className="date-range-control">
          <legend>Date range</legend>
          <DateControl label={fromLabel} value={values.dateFrom} max={values.dateTo || today} onChange={(value) => onChange("dateFrom", value)} />
          <DateControl label={toLabel} value={values.dateTo} min={values.dateFrom || undefined} max={today} onChange={(value) => onChange("dateTo", value)} />
        </fieldset>
        {sortOptions && <SelectControl className="sort-control" label="Order" value={values.sort} onChange={(value) => onChange("sort", value)} options={sortOptions} />}
      </div>
    </details>
  </div>;
}
