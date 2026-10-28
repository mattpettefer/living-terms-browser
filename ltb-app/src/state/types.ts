export type DestinationId =
  | 'campus-life'
  | 'academics-careers'
  | 'university-news'
  | 'alumni-community'
  | 'health-wellness'
  | 'athletics';

export type Taxonomy = 'category' | 'post_tag';
export type TermKey = `${Taxonomy}:${number}`;
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export interface Destination {
  id: DestinationId;
  name: string;
  /** Accent color used wherever this destination's ownership is shown. */
  color: string;
}

export type TermSort = 'alpha' | 'selected-first';

export type FilterOperator = 'OR' | 'AND';

export interface TempFilter {
  /** Exclude posts carrying any of these terms. Missing in older configs. */
  notTermKeys?: TermKey[];
  operator: FilterOperator;
  id: string;
  name: string;
  termKeys: TermKey[];
}
/** Config tabs: one per destination, a view of unassigned terms, and the temporary secondary filter. */
export type ConfigTab = DestinationId | 'unassigned' | 'temp-filter';

export interface SourceTerm {
  key: TermKey;
  id: number;
  taxonomy: Taxonomy;
  name: string;
  slug: string;
  /** Source post total; null until an API response supplies the count. */
  sourceCount: number | null;
}

export interface PostRecord {
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
  contentHtml?: string;
  contentLoaded: boolean;
}

export interface RequestState {
  status: RequestStatus;
  error: string | null;
  requestId: string | null;
}

/** Loading state of the complete lightweight post index that backs every Overview list. */
export interface PostIndexState extends RequestState {
  complete: boolean;
  loadedPages: number;
  totalPages: number | null;
  totalPosts: number | null;
  fetchedAt: number | null;
}

export type PostSelections = Partial<Record<number, DestinationId>>;

export type DestinationExclusions = Partial<Record<DestinationId, TermKey[]>>;

export type Assignments = Partial<Record<TermKey, DestinationId>>;

export interface PendingTermMove {
  termKey: TermKey;
  fromCategory: DestinationId;
  toCategory: DestinationId;
}

export interface UnresolvedAssignment {
  termKey: string;
  destination: string;
  reason: string;
}

export interface AppState {
  source: { baseUrl: string; postsRestBase: string };
  /** Raw configuration JSON embedded by the shortcode, if any, so it can be re-imported on demand. */
  pageSeed: string | null;
  destinationCategories: Destination[];
  termsByKey: Partial<Record<TermKey, SourceTerm>>;
  termOrder: TermKey[];
  excludedTermKeys: TermKey[];
  termsInventory: RequestState & { complete: boolean; fetchedAt: number | null; loadedPages: number; totalPages: number | null };

  assignments: Assignments;
  destinationExclusions: DestinationExclusions;
  /** Explicit editorial choice, independent of term matching. */
  postSelections: PostSelections;
  mappingRevision: number;
  /**
   * Temporary secondary filters. The active one, when non-empty, narrows every
   * Overview list using its operator (OR = any term, AND = every term).
   * Independent of destination assignments; saved locally and included in
   * configuration exports. There is always at least one filter.
   */
  tempFilters: TempFilter[];
  activeTempFilterId: string;
  /** False = "No Filter": the Overview ignores temp filters without discarding them. */
  tempFilterEnabled: boolean;
  unresolvedAssignments: UnresolvedAssignment[];
  postsById: Record<number, PostRecord>;
  /** Newest-first order of every indexed post ID. */
  postOrder: number[];
  postIndex: PostIndexState;
  /** Featured-image URL by media ID; null means the media item is missing on the source. */
  mediaById: Record<number, string | null>;
  articleRequestsById: Record<number, RequestState>;

  ui: {
    view: 'overview' | 'selections' | 'config' | 'article';
    listView: 'overview' | 'selections';
    selectionsCategory: DestinationId | 'all';
    selectionsPage: number;
    selectionsScrollY: number;
    overviewCategory: DestinationId | 'all';
    /** Number of cards currently revealed (local paging over the index). */
    overviewPage: number;
    overviewScrollY: number;
    activeConfigCategory: ConfigTab;
    termSearch: string;
    categoriesOnly: boolean;
    minTermPostCount: number;
    termSort: TermSort;
    selectedPostId: number | null;
    pendingTermMove: PendingTermMove | null;
  };
  persistence: { status: 'saved' | 'saving' | 'error' | 'unsaved'; error: string | null; lastSavedAt: number | null };
}

export type PostMatches = Partial<Record<DestinationId, TermKey[]>>;
