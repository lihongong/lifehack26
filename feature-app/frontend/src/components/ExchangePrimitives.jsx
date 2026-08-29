import { ChevronDown, Search } from "lucide-react";

export function FeedHeader({ eyebrow, title, id, countLabel, description }) {
  return (
    <header className="feed-header">
      <div className="feed-heading-row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
        <span className="feed-count" aria-live="polite">{countLabel}</span>
      </div>
      {description && <p className="feed-description">{description}</p>}
    </header>
  );
}

export function SearchControl({ label, placeholder, value, onChange, className = "" }) {
  return (
    <label className={`search-field${className ? ` ${className}` : ""}`}>
      <Search aria-hidden="true" size={20} strokeWidth={2.1} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={label}
      />
    </label>
  );
}

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
