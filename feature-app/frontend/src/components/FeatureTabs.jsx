import { NavLink } from "react-router-dom";

const tabs = [
  { href: "/", label: "Marketplace" },
  { href: "/buffets", label: "Buffets" },
  { href: "/lost-and-found", label: "Lost & Found" },
];

export default function FeatureTabs() {
  return (
    <nav className="feature-tabs" aria-label="Community Exchange sections">
      {tabs.map((tab) => (
        <NavLink
          className={({ isActive }) => isActive ? "active" : undefined}
          end={tab.href === "/"}
          to={tab.href}
          key={tab.label}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
