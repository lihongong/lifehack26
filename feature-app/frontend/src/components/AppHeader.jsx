export default function AppHeader() {
  return (
    <header className="app-header">
      <a className="brand" href="/" aria-label="uNivUS home">
        <span>u</span>Niv<span>U</span>S
      </a>
      <button className="profile-button" type="button" disabled aria-label="Sign in required">
        ◉
      </button>
    </header>
  );
}
