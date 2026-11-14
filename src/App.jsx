import './App.css';
import Map from './Map.jsx';

function App() {
  return (
    <div className="page">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="WSU GPS home">
            <span className="brand-mark" aria-hidden="true">W</span>
            <span className="brand-name">
              WSU GPS
              <span className="brand-caption">WAYNE STATE UNIVERSITY</span>
            </span>
          </a>
          <span className="header-location">Detroit, Michigan</span>
        </div>
      </header>
      <main className="site-main">
        <div className="page-intro">
          <p className="eyebrow">YOUR CAMPUS, MADE EASIER</p>
          <h1>Find your way around campus.</h1>
          <p className="intro-copy">
            Search Wayne State buildings and listed classrooms, then get a walking route to your destination.
          </p>
        </div>
        <Map />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <small>&copy; {new Date().getFullYear()} WSU GPS</small>
          <small>Building locations are approximate. Indoor navigation is not available.</small>
        </div>
      </footer>
    </div>
  );
}

export default App;
