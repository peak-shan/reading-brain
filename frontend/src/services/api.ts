/**
 * API request layer — axios instance + auth / article / tag namespaces.
 *
 * All functions return the unwrapped response data.
 * Errors are thrown as AxiosError for the caller to handle.
 */

import axios from "axios";
import type {
  Article,
  ArticleListParams,
  ArticleUpdatePayload,
  HealthCheck,
  Highlight,
  HighlightCreate,
  PaginatedArticles,
  SearchResult,
  Tag,
  TagUpdatePayload,
  TagWithCount,
} from "../types";

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = "reading_brain_token";
const USERNAME_KEY = "reading_brain_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor — attach Bearer token
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — add context for network errors, handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 → clear token and redirect to login
    if (error.response?.status === 401) {
      clearToken();
      // Only redirect if not already on /login
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    if (!error.response) {
      // Network error (no response from server)
      if (error.code === "ECONNABORTED") {
        return Promise.reject(
          Object.assign(error, {
            message: "请求超时，请检查网络连接后重试",
          }),
        );
      }
      return Promise.reject(
        Object.assign(error, {
          message: "网络错误，请检查网络连接后重试",
        }),
      );
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<HealthCheck> {
  const { data } = await api.get<HealthCheck>("/health");
  return data;
}

// ---------------------------------------------------------------------------
// authApi
// ---------------------------------------------------------------------------

export const authApi = {
  /** POST /api/auth/login — verify credentials, return JWT token */
  login(username: string, password: string): Promise<{ token: string; username: string }> {
    return api.post("/auth/login", { username, password }).then((r) => r.data);
  },

  /** POST /api/auth/change-password — change admin password (requires auth) */
  changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    return api.post("/auth/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    }).then((r) => r.data);
  },

  /** GET /api/auth/me — get current user info (requires auth) */
  getMe(): Promise<{ username: string }> {
    return api.get("/auth/me").then((r) => r.data);
  },
};

// ---------------------------------------------------------------------------
// articleApi
// ---------------------------------------------------------------------------

export const articleApi = {
  /** POST /api/articles — add article by URL */
  addArticle(url: string): Promise<Article> {
    return api.post<Article>("/articles", { url }).then((r) => r.data);
  },

  /** GET /api/articles — paginated list with filters */
  getArticles(params?: ArticleListParams): Promise<PaginatedArticles> {
    return api
      .get<PaginatedArticles>("/articles", { params })
      .then((r) => r.data);
  },

  /** GET /api/articles/:id — article detail */
  getArticle(id: number): Promise<Article> {
    return api.get<Article>(`/articles/${id}`).then((r) => r.data);
  },

  /** PUT /api/articles/:id — update article */
  updateArticle(id: number, data: ArticleUpdatePayload): Promise<Article> {
    return api.put<Article>(`/articles/${id}`, data).then((r) => r.data);
  },

  /** DELETE /api/articles/:id — delete article */
  deleteArticle(id: number): Promise<void> {
    return api.delete(`/articles/${id}`).then(() => undefined);
  },

  /** GET /api/articles/search?q=... — full-text search */
  searchArticles(
    query: string,
    page = 1,
    pageSize = 20,
  ): Promise<SearchResult> {
    return api
      .get<SearchResult>("/articles/search", {
        params: { q: query, page, page_size: pageSize },
      })
      .then((r) => r.data);
  },

  // ---- Highlights ----

  /** GET /api/articles/:id/highlights */
  getHighlights(articleId: number): Promise<Highlight[]> {
    return api
      .get<Highlight[]>(`/articles/${articleId}/highlights`)
      .then((r) => r.data);
  },

  /** POST /api/articles/:id/highlights */
  addHighlight(
    articleId: number,
    data: HighlightCreate,
  ): Promise<Highlight> {
    return api
      .post<Highlight>(`/articles/${articleId}/highlights`, data)
      .then((r) => r.data);
  },

  /** DELETE /api/articles/:id/highlights/:highlightId */
  deleteHighlight(articleId: number, highlightId: number): Promise<void> {
    return api
      .delete(`/articles/${articleId}/highlights/${highlightId}`)
      .then(() => undefined);
  },
};

// ---------------------------------------------------------------------------
// tagApi
// ---------------------------------------------------------------------------

export const tagApi = {
  /** GET /api/tags — all tags with article count */
  getTags(): Promise<TagWithCount[]> {
    return api.get<TagWithCount[]>("/tags").then((r) => r.data);
  },

  /** PUT /api/tags/:id — update tag name / color */
  updateTag(id: number, data: TagUpdatePayload): Promise<Tag> {
    return api.put<Tag>(`/tags/${id}`, data).then((r) => r.data);
  },

  /** DELETE /api/tags/:id — delete tag (detach from articles) */
  deleteTag(id: number): Promise<void> {
    return api.delete(`/tags/${id}`).then(() => undefined);
  },

  /** POST /api/tags/merge — merge source tag into target */
  mergeTags(sourceId: number, targetId: number): Promise<TagWithCount> {
    return api
      .post<TagWithCount>("/tags/merge", {
        source_id: sourceId,
        target_id: targetId,
      })
      .then((r) => r.data);
  },
};

export default api;
