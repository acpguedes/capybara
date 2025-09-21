import { CategorizedBookmark } from "./categorizer";

class SearchIndex {
  private index: CategorizedBookmark[] = [];

  public index(bookmarks: CategorizedBookmark[]): void {
    this.index = bookmarks;
  }

  public query(term: string): CategorizedBookmark[] {
    const normalizedTerm = term.toLowerCase();
    return this.index.filter((bookmark) => {
      return (
        bookmark.title.toLowerCase().includes(normalizedTerm) ||
        bookmark.url.toLowerCase().includes(normalizedTerm) ||
        bookmark.category.toLowerCase().includes(normalizedTerm)
      );
    });
  }
}

export const searchBookmarks = new SearchIndex();
