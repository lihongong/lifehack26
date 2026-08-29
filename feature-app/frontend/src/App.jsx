import { Navigate, Route, Routes } from "react-router-dom";
import ExchangePage from "./pages/ExchangePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ProfileSetupPage from "./pages/ProfileSetupPage.jsx";
import PublicProfilePage from "./pages/PublicProfilePage.jsx";
import PolicyPage from "./pages/PolicyPage.jsx";
import OperatorPage from "./pages/OperatorPage.jsx";
import ModerationPage from "./pages/ModerationPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ExchangePage />} />
      <Route path="/buffets" element={<ExchangePage />} />
      <Route path="/lost-and-found" element={<ExchangePage />} />
      <Route path="/profile/setup" element={<ProfileSetupPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/policies" element={<PolicyPage />} />
      <Route path="/participants/:publicId" element={<PublicProfilePage />} />
      <Route path="/operator" element={<OperatorPage />} />
      <Route path="/moderation/marketplace" element={<ModerationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
