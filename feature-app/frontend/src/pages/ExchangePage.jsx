import { useLocation } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import FeatureTabs from "../components/FeatureTabs.jsx";
import BuffetFeed from "../components/BuffetFeed.jsx";
import MarketplaceFeed from "../components/MarketplaceFeed.jsx";
import LostAndFoundFeed from "../components/LostAndFoundFeed.jsx";

const routes = { "/buffets": "Buffets", "/lost-and-found": "Lost & Found" };

export default function ExchangePage() {
  const { pathname } = useLocation();
  const active = routes[pathname] || "Marketplace";
  return (
    <main className="app-shell">
      <AppHeader />
      <section className="welcome">
        <p className="eyebrow">SHARENUS</p>
        <h1>
          Find it. Share it.
          <br />
          <strong>Keep it on campus.</strong>
        </h1>
        <p>A public preview for the NUS community.</p>
      </section>
      <FeatureTabs />
      {active === "Marketplace" ? (
        <MarketplaceFeed />
      ) : active === "Buffets" ? (
        <BuffetFeed />
      ) : <LostAndFoundFeed />}
      <footer>
        <span>Fixture records are marked as fictional.</span>
        <span>Private features use your uNivUS session.</span>
      </footer>
    </main>
  );
}
