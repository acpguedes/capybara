import { useEffect, useMemo, useState } from "react";
import { searchBookmarks } from "../domain/services/search";

export function App(): JSX.Element {
  const [query, setQuery] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        await searchBookmarks.hydrateFromStorage();
      } finally {
        if (isMounted) {
          setHasHydrated(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-query when hydration completes
  const results = useMemo(() => searchBookmarks.query(query), [query, hasHydrated]);

  const showEmpty = hasHydrated && results.length === 0;

  return (
    <main>
      <header className="popup-header">
        <div className="popup-logo">
          <h1>Capybara</h1>
        </div>
      </header>

      <div className="popup-search-wrapper">
        <input
          type="search"
          placeholder="Search bookmarks..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {!hasHydrated && (
        <div className="popup-loading">
          <p>Loading bookmarks...</p>
        </div>
      )}

      {showEmpty && (
        <div className="popup-empty">
          <p>
            {query.length > 0
              ? "No bookmarks match your search."
              : "No bookmarks found. Browse some pages and check back."}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <section className="popup-results">
          <ul>
            {results.map((bookmark) => (
              <li key={bookmark.id}>
                <a className="bookmark-link" href={bookmark.url} target="_blank" rel="noreferrer">
                  <span className="bookmark-title">{bookmark.title}</span>
                  <span className="bookmark-category">{bookmark.category}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="popup-footer">
        <small>Capybara v0.0.1</small>
      </footer>
    </main>
  );
}
