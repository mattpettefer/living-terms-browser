# Living Term Browser — Preact Build Specification

## 1. Purpose and scope

Build a small internal Preact app for browsing posts from **https://living.life.edu**, inspecting their existing terms, and organizing those terms into six app-defined destination categories.

The app has three main views: **Overview**, **Config**, and **View** (the article detail page). It reads posts and terms through the source site's WordPress REST API. Mapping edits are app configuration; they do not change posts, categories, or tags on Living or Life.edu.

This is an internal classification and browsing tool. The earlier public blog mockups establish the category vocabulary and rectangular card direction, but this app does not require the public site's header, featured-story section, newsletter, popular-post ranking, Google Analytics integration, or Gutenberg editing system. The earlier independent Gutenberg-block/controller discussion is not a requirement for this standalone app.

Use Preact. For a new project, Preact + TypeScript + Vite is a reasonable implementation default. Reuse the existing build system if working inside an established repository. Do not use WP-CLI.

## 2. Fundamental data distinctions

### Destination categories

These are app-owned grouping records. They are completely separate from WordPress categories and tags. They do not require records on the destination WordPress site.

Use this order and these exact display names:

| App-owned ID | Display name |
|---|---|
| `campus-life` | Campus Life |
| `academics-careers` | Academics & Careers |
| `university-news` | University News |
| `alumni-community` | Alumni & Community |
| `health-wellness` | Health & Wellness |
| `athletics` | Athletics |

**Campus Life** replaces Student Life. **Alumni & Community** replaces Alumni and includes community partnerships and involvement. Use the new names in navigation, tabs, dialogs, tooltips, saved configuration, and exports. When importing older configuration, migrate `student-life` to `campus-life` and `alumni` to `alumni-community`.

### Source terms

Every existing WordPress category and tag is a source **term**. Present both identically to users: the same rounded buttons, naming, search, selection, and assignment behavior. Do not separate them into category/tag sections or give them different colors or badges.

Keep taxonomy and the actual WordPress term ID internally for API queries. Use a stable key such as `${taxonomy}:${id}`. In the UI, call the combined collection **Terms**.

A source category named Athletics is simply another assignable term. It has no automatic relationship with the app's Athletics destination category, even if the names match exactly. Do not invent numeric IDs. In particular, `83` was previously used as an illustrative ID and must not be seeded as Athletics' real ID. Fetch IDs from the source API.

Identical names do not establish identical terms. Preserve distinct source keys. Do not merge a category and a tag solely because their labels match. If duplicate labels need disambiguation, expose their source term IDs in a consistent tooltip or secondary inspection detail, without introducing category-versus-tag styling.

### Source term availability (updated October 26, 2026)

All source categories and tags are available for assignment, including **Slice of LIFE**, **Faces of LIFE**, **FACES of LIFE FRIDAY**, and **Podcast**. The previous name-based exclusions have been removed.

The legacy `excludedTermKeys` field remains empty for configuration compatibility. Historical exclusion references below are superseded by this rule. These terms work like other terms in Config, article detail, destination matching, and temporary filters.

## 3. Matching and assignment rules

1. A source term may be assigned to **zero or one** destination category.
2. A destination category may own any number of source terms.
3. A post matches a destination category when **any** of its attached source terms is assigned to that category. This is OR matching, across both source taxonomies.
4. Match explicit attached term IDs. Do not silently infer assignments from names, article text, or parent-category ancestry.
5. A post may match multiple destination categories because different attached terms belong to different categories. Keep it in each matching result set and flag the overlap.
6. Count a post only once within a destination category, even if several of its terms match.
7. A destination with no assigned terms has no matching posts. Never accidentally turn an empty assignment into an unfiltered request.
8. Configuration changes update all derived matches and warnings immediately for already cached posts.

Do not initialize exclusive assignments directly from the earlier overlapping spreadsheet. That table contains proposals, combined aliases, and terms intentionally repeated across groups. A seed import must resolve individual real source terms and identify conflicting proposed destinations for review. Never let file order or “last assignment wins” decide a term's destination. Start unassigned when no approved mapping is supplied.

## 4. Overview

- Show a top navigation control for Overview and Config.
- Show the six destination categories as a horizontal filter bar, wrapping naturally on narrow screens.
- Recommended default: also provide **All Posts**, which applies no destination filter. This is a navigation option, not a seventh destination category.
- Selecting a destination uses its assigned source terms to retrieve matching published Living posts.
- Display posts as rectangular cards in a responsive grid. Include a thumbnail when available, decoded title, short excerpt, publication date, and an overlap indicator when applicable. Provide an intentional image fallback.
- Clicking a card opens the article View inside the app. Also provide an ordinary source link when useful.
- Use newest-first ordering with a deterministic tie-break when merging results. Provide pagination or Load More; do not assume the first API page contains every match.
- Preserve the selected category, loaded results, page, and scroll position when visiting an article and returning.
- Distinguish loading, loaded-empty, and failed states. Show an actionable retry on failure.
- A post matching multiple categories receives a visible warning such as **Multiple categories**. Its destination labels must be inspectable from the card or detail page.
- Results must not jump to an earlier selection when a slower, outdated request completes.

Use actual API data, not mock posts, fabricated totals, or hardcoded term IDs. A development fixture may exist only as an explicitly separate test mode.

## 5. Config

### Layout and term controls

- One tab per destination category, in the order above.
- Below the selected category heading, list all eligible source terms as clickable rounded buttons.
- Every tab uses the same term collection. It is the current assignment that determines which buttons are highlighted.
- A term assigned to the current tab is highlighted and exposes `aria-pressed="true"`.
- An unassigned term is neutral. A term assigned elsewhere is not highlighted as selected in the current tab; its current destination can be shown in a tooltip.
- Include a term-name search field and alphabetical ordering. There are thousands of terms, so use incremental rendering or virtualization while keeping the whole collection searchable. Do not load only the first API page and call it the complete inventory.
- Use the same controls for source categories and source tags. Taxonomy is an implementation detail.

### Click behavior

| Current assignment | Click in selected tab | Result |
|---|---|---|
| Unassigned | Select term | Assign immediately; no confirmation |
| Assigned to this tab | Select highlighted term | Unassign immediately |
| Assigned to a different tab | Select term | Open move confirmation; do not change assignment yet |

Example dialog wording: **Move “Nutrition” from Health & Wellness to Academics & Careers?** Buttons: **Move** and **Cancel**.

On confirmation, replace the term's old destination with the new one in one atomic state update. The previous tab must no longer show it selected. On cancellation, nothing changes. Recheck the current assignment at confirmation time; if it changed while the dialog was open, refresh the confirmation instead of moving it from an unexpected owner.

The overlap warning is about a specific post's combined terms. Do not globally color every Config term red because some article happens to overlap. Config has no single article context.

## 6. View: full article and term sidebar

- Fetch the selected post's full content through the source REST API when needed.
- Display its title, date, available featured image, and complete article body in a readable main column.
- Display a sidebar headed **Terms**, containing the source terms attached to that article as rounded controls with identical treatment for categories and tags.
- Show the post's matched destination categories and a warning when it matches more than one.
- Show which destination owns an assigned term in its tooltip. Unassigned terms remain neutral; do not imply that they belong to a destination.
- The sidebar is for inspecting terms. Editing assignments directly from this view is not required for the first version; Config owns assignment editing.
- Provide a Back to Overview control and preserve browsing context. Support browser Back/Forward and direct article URLs.
- On smaller screens, move the sidebar below the article rather than shrinking the text excessively.

### Red terms and hover text

If the article matches two or more destination categories, mark each assigned, non-excluded term contributing to those matches **red**. Several terms owned by the same destination do not, by themselves, create an overlap.

For a red term, the tooltip shows its assigned destination and the **other destination categories that the article also matches**. For example:

> Assigned to Athletics. This article also matches Campus Life and Alumni & Community.

The tooltip does not claim that the term itself has multiple assignments. The other article terms cause the overlap. It may additionally identify the terms responsible for those other matches.

The same information must be available on keyboard focus and tap, not hover alone. Include a textual warning or icon with an accessible name so red is not the only indication.

### Content rendering

Use the API's rendered content, with HTML sanitization and styles scoped to the article container. Preserve headings, paragraphs, lists, links, images, and supported media. Do not execute returned scripts. Resolve relative links/media against the source URL. Avoid duplicating the featured image when the body already contains it.

Some legacy posts use builder shortcodes or theme-specific content. Verify representative examples. API content does not guarantee that the old site's JavaScript and theme styling will be reproduced. If the API returns unresolved shortcodes or unsupported embeds, show a clear rendering notice and a source-page link; do not silently omit the body or claim it is fully rendered. Any special legacy rendering adapter should be isolated and tested.

## 7. Shared state model

Use one Preact provider and reducer, with pure selectors for derived results. Components dispatch actions rather than maintaining conflicting copies of assignments or posts. Network requests and persistence belong in services/effects, not inside the reducer.

The following types describe the required shape; they contain no fabricated live IDs:

```ts
type DestinationId =
  | 'campus-life'
  | 'academics-careers'
  | 'university-news'
  | 'alumni-community'
  | 'health-wellness'
  | 'athletics';

type Taxonomy = 'category' | 'post_tag';
type TermKey = `${Taxonomy}:${number}`;
type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

interface SourceTerm {
  key: TermKey;
  id: number;                 // Actual source API ID
  taxonomy: Taxonomy;         // Internal only
  name: string;              // Decoded display text
  slug: string;
  sourceCount: number;        // Not a destination-category total
}

interface PostRecord {
  id: number;
  title: string;
  excerptHtml: string;
  sourceUrl: string;
  date: string;
  modified: string;
  featuredMediaId: number;
  imageUrl: string | null;
  termKeys: TermKey[];
  termsComplete: boolean;
  contentHtml?: string;       // Undefined means not fetched
  contentLoaded: boolean;    // Empty content is still a loaded response
}

interface RequestState {
  status: RequestStatus;
  error: string | null;
  requestId: string | null;
}

interface QueryEntry extends RequestState {
  postIds: number[];
  totalPosts: number | null;
  totalPages: number | null;
  page: number;
  fetchedAt: number | null;
  mappingRevision: number;
}

interface AppState {
  source: { baseUrl: string; postsRestBase: string };
  destinationCategories: Array<{ id: DestinationId; name: string }>;
  termsByKey: Partial<Record<TermKey, SourceTerm>>;
  termOrder: TermKey[];
  excludedTermKeys: TermKey[];
  termsInventory: RequestState & { complete: boolean; fetchedAt: number | null };

  assignments: Partial<Record<TermKey, DestinationId>>;
  mappingRevision: number;
  postsById: Record<number, PostRecord>;
  queriesByKey: Record<string, QueryEntry>;
  articleRequestsById: Record<number, RequestState>;

  ui: {
    view: 'overview' | 'config' | 'article';
    overviewCategory: DestinationId | 'all';
    overviewPage: number;
    overviewScrollY: number;
    activeConfigCategory: DestinationId;
    termSearch: string;
    selectedPostId: number | null;
    pendingTermMove: null | {
      termKey: TermKey;
      fromCategory: DestinationId;
      toCategory: DestinationId;
    };
  };
  persistence: { status: 'saved' | 'saving' | 'error'; error: string | null };
}
```

Namespace persisted keys and caches by the normalized source site URL. If support for multiple source sites is added later, qualify term and post identities by site as well.

### Required selectors

- `getAssignedTerms(destinationId)` — source terms owned by a destination.
- `getPostMatches(post)` — destination IDs mapped to the attached term keys that caused each match.
- `getPostOverlap(post)` — whether the post has at least two distinct matched destinations.
- `getTermWarning(post, termKey)` — current destination, other matched destinations, and explanation.
- `getVisibleTerms(search)` — combined eligible inventory for Config.
- `getOverviewResults(queryKey)` — cached result IDs resolved to shared post records.

Example overlap calculation:

```ts
function getPostMatches(
  post: PostRecord,
  assignments: AppState['assignments'],
  excluded: ReadonlySet<TermKey>
): Partial<Record<DestinationId, TermKey[]>> {
  const matches: Partial<Record<DestinationId, TermKey[]>> = {};
  for (const key of new Set(post.termKeys)) {
    if (excluded.has(key)) continue;
    const destination = assignments[key];
    if (!destination) continue;
    (matches[destination] ??= []).push(key);
  }
  return matches;
}

const isOverlapping = Object.keys(matches).length > 1;
```

Only declare a definitive no-overlap result when the post's complete category/tag ID arrays are available. Resolve missing term labels in batches; an unknown label must not erase a known ID or its assignment.

Do not persist separate `isRed`, `isOverlapping`, or `matchedDestinationIds` flags. Derive them from the current assignments so they cannot become stale.

### Reducer actions

Provide actions for navigation, term inventory loading, post/query loading, article loading, search, assignment, unassignment, opening/cancelling/confirming a move, configuration import, and persistence failures.

Every committed assignment change increments `mappingRevision` and invalidates affected destination result lists. For simplicity, invalidating all destination-specific query lists is acceptable at this scale. Keep reusable post records and full content caches. All Posts results need not be invalidated solely because mapping changed.

## 8. API access and request strategy

### Verify the live source before wiring the UI

Use `https://living.life.edu/wp-json/` as the starting API base. Inspect the site's actual routes, supported post type, fields, and browser CORS behavior. Expected standard routes are `/wp/v2/posts`, `/wp/v2/categories`, and `/wp/v2/tags`, but they have not been live-verified as part of this specification. Do not assume the export's transformed `blog` post type is the source site's API endpoint.

Keep the post REST base configurable. Use read-only public published data by default. If an authenticated internal deployment is needed, use an appropriate server-side credential path; do not put private credentials in frontend code.

### Term inventory

Fetch source categories and tags as paginated collections and normalize them into one store. Include empty terms if the source supports `hide_empty=false`, since configuration should not depend on whether a term currently has a published post. Preserve source IDs, names, and slugs. Resolve exclusions once the inventory is available.

Use `per_page` up to the supported limit (standard WordPress maximum is 100), follow pagination headers, and cache successful pages. Track whether inventory loading is complete. Do not repeatedly download the entire term collection on tab switches. A small bounded queue, for example three requests at a time, is a suitable default. [2][3]

### Overview queries

For a selected destination, partition its assigned term keys internally into source category IDs and source tag IDs. Request posts matching **any** of those IDs. Standard WordPress post collections expose `categories`, `tags`, and `tax_relation=OR`; verify equivalent behavior on the source route. Omit empty filter parameters. Never send destination app IDs as WordPress IDs. [1]

Target one combined post request per results page, not one request per term, card, or UI component. Keep complete `categories` and `tags` arrays in every returned post, even when fetching a filtered list, because overlap detection needs all attached terms.

The UI's matching contract is exact attached IDs. Verify parent/child query behavior against that contract. If the source expands descendants or cannot express the desired OR query, use a source adapter that restores exact semantics; do not silently change the mapping rules or expose incorrect totals.

If a large assignment creates an oversized query URL or the source cannot support a combined query, choose one documented fallback:

1. An app-owned read-only server endpoint/proxy that aggregates the query; or
2. A paginated lightweight post index fetched once and cached, then filtered locally.

A complete lightweight index can include only the metadata required for filtering and cards. Fetch full article bodies on demand. If index loading is incomplete, label results/counts as partial. Do not merge just the first page of separate taxonomy queries and present it as a globally sorted, complete page.

### Payloads, caching, and article requests

Use `_fields` to keep list payloads small. Card requests need identifiers, title, excerpt, date, modified timestamp, source link, media reference, and complete category/tag IDs. Fetch full `content.rendered` for article detail. Use media embedding or batched media retrieval to avoid a separate request per card. When combining `_fields` and `_embed`, retain the embedding-related fields required by WordPress. [1][4]

Key queries by source, destination, mapping revision, sorted filter IDs, page, page size, and ordering. Deduplicate identical in-flight requests. Use AbortController and/or request IDs so outdated responses cannot replace current results. Keep request controllers outside serializable state.

Cache full article content by post ID and modified timestamp. Merge summary responses without overwriting already cached body content unless the post changed. Revisiting a fresh cached article should not refetch it unnecessarily.

If cross-origin requests are blocked, use a same-origin read-only proxy restricted to the configured Living source. An opaque `no-cors` response is not a solution. Handle HTTP errors, unavailable media, missing articles, retry, and rate limits explicitly.

## 9. Persistence and routing defaults

Recommended first-version default: a single-user browser app with configuration autosaved to localStorage. Save a versioned configuration document containing source URL, destination definitions, assignments, excluded term keys, and modification time. Provide JSON export/import so mapping work can be backed up and transferred. Cached API data is expendable; assignment configuration is not.

Validate imported source identity, schema version, term keys, allowed destination IDs, exclusions, and exclusive ownership. Resolve old category names using the migration above. Preserve unknown/missing source terms as unresolved configuration instead of silently discarding work. Report storage failures rather than displaying a false Saved status.

Local storage is not shared across browsers or users. If team-wide shared editing is required, replace the persistence adapter with a server-backed store and conflict/version handling. Keep that decision separate from reading the Living API.

Use a lightweight router or hash routes, such as `#/overview`, `#/config/campus-life`, and `#/article/<actual-post-id>`. Keep the selected Overview filter/page in the route or navigation state so Back restores the browsing context. Close pending dialogs on navigation. The source URL and persistence adapter should be easy to configure without changing rendering components.

## 10. Suggested code organization

```text
src/
  app.tsx
  components/
    DestinationFilterBar.tsx
    PostCard.tsx
    TermButton.tsx
    TermTooltip.tsx
    MoveTermDialog.tsx
    LoadingState.tsx
    ErrorState.tsx
  views/
    Overview.tsx
    Config.tsx
    ArticleView.tsx
  state/
    types.ts
    provider.tsx
    reducer.ts
    selectors.ts
    destinations.ts
  services/
    wordpress.ts
    requestCache.ts
    persistence.ts
    normalize.ts
  styles/
    app.css
    article.css
```

The exact file layout is flexible. Centralize source fetching, assignment logic, and overlap selectors. Avoid independent per-view copies of the same mapping. Preact context and `useReducer` provide the shared-store foundation. [5]

## 11. Accessibility and interaction requirements

- Use actual buttons for selectable terms and filters, and proper links for navigation.
- Make Config tabs keyboard-operable and expose their selected state.
- Give the move dialog an accessible name, focus management, Escape cancellation, and focus return to its triggering term.
- Provide warning explanations on focus and tap as well as hover.
- Maintain visible focus and readable contrast, including red conflict styles.
- Keep loading/error announcements concise. Do not announce every background request separately.
- Ensure term search and incremental rendering remain usable by keyboard and assistive technology.

## 12. Implementation sequence

1. Verify the source API routes, representative term responses, post metadata, full article content, pagination, and CORS.
2. Implement app-owned destination definitions and normalized source records. Confirm no live IDs are hardcoded from illustrative examples.
3. Implement persistent exclusive assignments and pure matching/overlap selectors.
4. Build Config, including unassigned selection, deselection, and confirmed moves.
5. Build Overview using grouped OR queries, caching, deduplication, and rectangular cards.
6. Build article detail with full API content, uniform term sidebar, red warnings, and accessible explanations.
7. Add routing restoration, persistence recovery, import/export, loading/error handling, and representative legacy-content support.
8. Verify the acceptance cases below and document the configured source endpoint and local run/build commands.

## 13. Acceptance checks

1. The six destination labels use Campus Life and Alumni & Community; old labels appear only in import migrations.
2. A source term with the same name as a destination remains unassigned until explicitly assigned or imported from approved configuration.
3. Categories and tags use identical visible controls and behavior.
4. Selecting an unassigned term assigns it with no prompt. Clicking it again in its own tab unassigns it.
5. Selecting a term owned elsewhere prompts. Cancel leaves state untouched; Move changes ownership once and clears the old selection.
6. Imported assignments cannot give one term two destinations, and ambiguous seed proposals are not silently resolved.
7. Posts matching through multiple terms in one destination appear once and are not flagged merely for having several matching terms.
8. Posts matching two or more destinations appear in each relevant result set and are flagged. The sidebar's contributing terms turn red and explain the other destinations.
9. Removing or moving an assignment recomputes cached-post warnings immediately and refreshes affected result lists without stale response races.
10. Excluded terms cannot be assigned or cause a match; carrying an excluded term does not automatically hide a post that matches through another term.
11. Empty assignments show an empty result, not all posts. An unassigned article remains available through All Posts if that navigation option is implemented.
12. The API adapter uses actual source IDs, OR semantics across both taxonomies, pagination, and unique-post counting. It does not sum term counts into a destination total.
13. No per-term or per-card fetch loop is used for normal browsing. Changing Config tabs does not reload all terms.
14. A direct article URL loads its full content and terms; returning restores the Overview context.
15. Full content handles representative legacy posts honestly. Missing media and unsupported content have clear fallbacks.
16. Reloading preserves mappings. Storage, network, and import failures preserve existing work and expose actionable messages.
17. Tooltips, tabs, dialogs, and term selection work with keyboard and touch as well as mouse.

Use focused unit tests for assignment transitions and overlap selectors, plus integration checks for OR query semantics, pagination, cancellation, and state restoration. Do not rely only on screenshots to establish data correctness.

## 14. References

These references describe platform capabilities. Live source endpoints, available terms, counts, and legacy rendering behavior must still be checked during implementation.

1. [WordPress REST API — Posts](https://developer.wordpress.org/rest-api/reference/posts/)
2. [WordPress REST API — Categories](https://developer.wordpress.org/rest-api/reference/categories/) and [Tags](https://developer.wordpress.org/rest-api/reference/tags/)
3. [WordPress REST API — Pagination](https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/)
4. [WordPress REST API — Global parameters](https://developer.wordpress.org/rest-api/using-the-rest-api/global-parameters/)
5. [Preact — Hooks](https://preactjs.com/guide/v11/hooks/)
