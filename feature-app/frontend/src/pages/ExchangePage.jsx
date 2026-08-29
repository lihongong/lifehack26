import AppHeader from "../components/AppHeader.jsx";
import FeatureTabs from "../components/FeatureTabs.jsx";
import BuffetFeed from "../components/BuffetFeed.jsx";
import MarketplaceFeed from "../components/MarketplaceFeed.jsx";
import PlaceholderView from "../components/PlaceholderView.jsx";
const routes = { "/buffets": "Buffets", "/lost-and-found": "Lost & Found" };
export default function ExchangePage() {
  const active = routes[window.location.pathname] || "Marketplace";
  return (
    <main className="app-shell">
      <AppHeader />
      <section className="welcome">
        <p className="eyebrow">NUS COMMUNITY EXCHANGE</p>
        <h1>
          Find it. Share it.
          <br />
          <strong>Keep it on campus.</strong>
        </h1>
        <p>A public preview for the NUS community.</p>
      </section>
      <FeatureTabs active={active} />
      {active === "Marketplace" ? (
        <MarketplaceFeed />
      ) : active === "Buffets" ? (
        <BuffetFeed />
      ) : (
        <PlaceholderView
          title={active}
          description="A safe public Lost & Found feed is coming soon."
        />
      )}
      <footer>
        <span>All listings are fictional demo data.</span>
        <span>Private features use your uNivUS session.</span>
      </footer>
    </main>
  );
}
