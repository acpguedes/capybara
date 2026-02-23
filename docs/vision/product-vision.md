# Product Vision

## What Capybara Is

Capybara is a **personal knowledge management system** that starts with your bookmarks and grows into a structured, searchable, intelligent repository of everything you find valuable on the web.

It is not just a bookmark manager. It is a system for **externalizing cognitive memory** -- capturing, organizing, connecting, and recalling the knowledge you encounter online.

## The Problem

Everyone saves links. Almost no one goes back to them.

The core issue is not *saving* -- browsers make that trivial. The problem is **recall and reuse**:

- Bookmarks pile up across multiple browsers with no unified view
- There is no structure -- just flat lists or shallow folders
- Finding a saved link requires remembering *where* you saved it
- There is no intelligence -- the system never surfaces relevant content proactively
- Knowledge connections between links are invisible

The result: a digital junk drawer that grows endlessly but delivers diminishing value.

## The Solution

Capybara approaches this problem in three layers:

### Layer 1: Unification and Organization (Current)

Merge bookmarks from multiple browsers into a single, deduplicated library. Automatically categorize them using tags, domain heuristics, or AI-powered semantic analysis. Make everything instantly searchable with relevance-scored results.

**Key capabilities:**
- Cross-browser bookmark merging (Chromium + Firefox)
- Automatic categorization (heuristic and LLM-powered)
- Full-text search with relevance scoring
- Encrypted multi-device synchronization
- Knowledge graph (bookmark relationships)
- Usage tracking for intelligent recall

### Layer 2: Intelligence (Next)

Move from passive storage to active knowledge assistance. The system should understand *what* you saved and *why* it might matter:

- **Semantic search:** Find bookmarks by meaning, not just keywords. "Show me everything about distributed systems" should work even if no bookmark contains those exact words.
- **Auto-summarization:** Generate concise summaries of saved pages so you can scan your library without opening each link.
- **Smart suggestions:** "You saved 12 articles about causal inference -- here's what connects them."
- **Link health:** Detect broken links and suggest alternatives.
- **Reclassification audit:** Track how categories evolve over time.

### Layer 3: Knowledge Agent (Future)

Transform Capybara into an active partner in your knowledge workflow:

- **Contextual queries:** "What in my bookmarks is relevant to the project I'm working on right now?"
- **Cross-reference:** Connect bookmarks with local documents, GitHub repositories, and notes.
- **Insight generation:** Surface patterns and clusters in your saved knowledge.
- **Knowledge export:** Generate structured documents, mind maps, or reports from bookmark collections.

## Design Principles

### Privacy First
All data stays on the user's device by default. Network access is only requested when the user explicitly enables features that require it (LLM categorization, cloud sync). No telemetry, no analytics, no third-party data sharing.

### Calm Technology
Capybara follows the principle of calm technology: it should be invisible when you don't need it and immediately helpful when you do. No notifications spam, no gamification, no engagement metrics. The tool serves the user, not the other way around.

### Progressive Enhancement
Start simple, grow as needed. A user who never enables AI categorization or sync should still have a valuable experience. Every advanced feature builds on top of a solid, privacy-respecting foundation.

### Local Intelligence
Where possible, prefer local computation over API calls. Local embeddings, local search indexes, local categorization heuristics. API-based intelligence is optional and user-controlled.

### Open Architecture
The system should be extensible. New browser providers (Safari, mobile), new LLM providers, new storage backends, new UI surfaces -- all should plug in without disturbing the core pipeline.

## Positioning

Capybara sits at the intersection of several categories:

| Category | How Capybara Relates |
|----------|---------------------|
| **Bookmark managers** (Pocket, Raindrop) | Goes beyond saving -- adds intelligence, relationships, and recall |
| **Personal knowledge management** (Obsidian, Notion) | Focused on web content; lighter weight; lives in the browser |
| **Read-it-later** (Instapaper, Omnivore) | Captures links, but emphasizes organization and knowledge over reading |
| **RAG systems** | Structured retrieval over personal data, but without requiring infrastructure |

The unique value is the combination of:
1. **Browser-native** -- zero friction capture from the toolbar
2. **Cross-browser** -- unified view regardless of which browser you use
3. **Privacy-first** -- local storage, optional encryption, no mandatory cloud
4. **AI-enhanced** -- optional intelligence that respects user control

## Success Metrics

If Capybara is working well, users should experience:

- **Higher bookmark reuse rate** -- saved links get revisited, not forgotten
- **Faster recall** -- finding a saved link takes seconds, not minutes
- **Knowledge discovery** -- "I didn't know I had saved something about that" moments
- **Cross-browser fluidity** -- no more "which browser did I save that in?"
- **Trust** -- confidence that bookmarks are private, organized, and durable

## Technical Alignment

The product vision aligns with the technical architecture:

| Vision Layer | Technical Component |
|-------------|-------------------|
| Unification | Bookmark providers, merger service, storage abstraction |
| Organization | Categorizer, LLM categorizer, category store |
| Relationships | Bookmark relation model, relation discovery service |
| Search | Search index with relevance scoring |
| Intelligence | LLM providers, usage tracking, semantic search (planned) |
| Privacy | Extension-storage abstraction, snapshot encryption, optional permissions |

See the [Architecture Overview](../architecture/overview.md) for technical details.
