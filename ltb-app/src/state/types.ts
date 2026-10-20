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
}

export interface SourceTerm {
  key: TermKey;
  id: number;
  taxonomy: Taxonomy;
  name: string;
  slug: string;
  sourceCount: number;
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

export interface QueryEntry extends RequestState {
  postIds: number[];
  totalPosts: number | null;
  totalPages: number | null;
  page: number;
  fetchedAt: number | null;
  mappingRevision: number;
}

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
  destinationCategories: Destination[];
  termsByKey: Partial<Record<TermKey, SourceTerm>>;
  termOrder: TermKey[];
  excludedTermKeys: TermKey[];
  termsInventory: RequestState & { complete: boolean; fetchedAt: number | null; loadedPages: number; totalPages: number | null };

  assignments: Assignments;
  mappingRevision: number;
  unresolvedAssignments: UnresolvedAssignment[];
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
    categoriesOnly: boolean;
    selectedPostId: number | null;
    pendingTermMove: PendingTermMove | null;
  };
  persistence: { status: 'saved' | 'saving' | 'error' | 'unsaved'; error: string | null; lastSavedAt: number | null };
}

export type PostMatches = Partial<Record<DestinationId, TermKey[]>>;
