/** Core domain types for Reading Brain — mirrors backend Pydantic schemas. */

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export interface Tag {
  id: number;
  name: string;
  color?: string | null;
}

export interface TagWithCount extends Tag {
  article_count: number;
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

export type ReadStatus = "unread" | "reading" | "read" | "processing";

export interface Article {
  id: number;
  url: string;
  title: string | null;
  content: string | null;
  content_html: string | null;
  summary: string | null;
  key_insight: string | null;
  author: string | null;
  site_name: string | null;
  published_at: string | null;
  saved_at: string;
  read_status: ReadStatus;
  favorite: boolean;
  note: string | null;
  tags: Tag[];
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginatedArticles {
  items: Article[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ArticleListParams {
  page?: number;
  page_size?: number;
  tag?: string;
  status?: ReadStatus;
  favorite?: boolean;
  sort?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Highlight
// ---------------------------------------------------------------------------

export interface Highlight {
  id: number;
  text: string;
  note: string | null;
  position: number | null;
  created_at: string;
}

export interface HighlightCreate {
  text: string;
  note?: string;
  position?: number;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchItem {
  id: number;
  url: string;
  title: string | null;
  summary: string | null;
  read_status: ReadStatus | null;
  favorite: boolean | null;
  saved_at: string | null;
  site_name: string | null;
  author: string | null;
  snippet: string;
  matched_in: string;
  tags: Tag[];
}

export interface SearchResult {
  items: SearchItem[];
  total: number;
  query: string;
  page: number;
  page_size: number;
  pages: number;
}

// ---------------------------------------------------------------------------
// Tag update
// ---------------------------------------------------------------------------

export interface TagUpdatePayload {
  name?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Article update
// ---------------------------------------------------------------------------

export interface ArticleUpdatePayload {
  summary?: string;
  key_insight?: string;
  tags?: string[];
  read_status?: ReadStatus;
  favorite?: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthCheck {
  status: "ok";
}
