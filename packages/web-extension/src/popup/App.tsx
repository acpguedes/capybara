import { useMemo, useState } from "react";
import { searchBookmarks } from "../domain/services/search";

export function App(): JSX.Element {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBookmarks.query(query), [query]);

  return (
    <main>
      <header>
        <h1>Capybara</h1>
        <input
          type="search"
          placeholder="Search bookmarks"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>
      <section>
        <ul>
          {results.map((bookmark) => (
            <li key={bookmark.id}>
              <a href={bookmark.url} target="_blank" rel="noreferrer">
                <span>{bookmark.title}</span>
                <span>{bookmark.category}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
