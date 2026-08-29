const tabs = [
  { href: "/", label: "Marketplace" },
  { href: "/buffets", label: "Buffets" },
  { href: "/lost-and-found", label: "Lost & Found" },
];
export default function FeatureTabs({ active }) {
  return (
    <nav className="feature-tabs" aria-label="Community Exchange sections">
      {tabs.map((tab) => (
        <a
          className={active === tab.label ? "active" : ""}
          aria-current={active === tab.label ? "page" : undefined}
          href={tab.href}
          key={tab.label}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
