/**
 * React Query hooks for articles & tags.
 *
 * useQuery for reads (auto-caching, refetch, retries).
 * useMutation for writes (cache invalidation, optimistic updates).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { articleApi, tagApi } from "../services/api";
import type {
  ArticleListParams,
  ArticleUpdatePayload,
  HighlightCreate,
  TagUpdatePayload,
} from "../types";

// ---------------------------------------------------------------------------
// Query keys — centralised so mutations can invalidate precisely
// ---------------------------------------------------------------------------

export const queryKeys = {
  articles: ["articles"] as const,
  article: (id: number) => ["articles", id] as const,
  articleList: (params?: ArticleListParams) =>
    ["articles", "list", params] as const,
  search: (q: string, page?: number, pageSize?: number) =>
    ["articles", "search", q, page, pageSize] as const,
  tags: ["tags"] as const,
  highlights: (articleId: number) => ["highlights", articleId] as const,
};

// ---------------------------------------------------------------------------
// Article hooks
// ---------------------------------------------------------------------------

/** Paginated article list with optional filters. */
export function useArticles(params?: ArticleListParams) {
  return useQuery({
    queryKey: queryKeys.articleList(params),
    queryFn: () => articleApi.getArticles(params),
  });
}

/** Single article detail. */
export function useArticle(id: number) {
  return useQuery({
    queryKey: queryKeys.article(id),
    queryFn: () => articleApi.getArticle(id),
    enabled: id > 0,
  });
}

/** Full-text search. */
export function useSearchArticles(
  query: string,
  page = 1,
  pageSize = 20,
) {
  return useQuery({
    queryKey: queryKeys.search(query, page, pageSize),
    queryFn: () => articleApi.searchArticles(query, page, pageSize),
    enabled: query.trim().length > 0,
  });
}

/** Add article by URL. */
export function useAddArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => articleApi.addArticle(url),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.articles });
    },
  });
}

/** Update article fields. */
export function useUpdateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ArticleUpdatePayload }) =>
      articleApi.updateArticle(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.article(variables.id) });
      qc.invalidateQueries({ queryKey: queryKeys.articles });
    },
  });
}

/** Delete article. */
export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => articleApi.deleteArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.articles });
    },
  });
}

// ---------------------------------------------------------------------------
// Tag hooks
// ---------------------------------------------------------------------------

/** All tags with article count. */
export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => tagApi.getTags(),
  });
}

/** Update tag name / color. */
export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TagUpdatePayload }) =>
      tagApi.updateTag(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags });
      qc.invalidateQueries({ queryKey: queryKeys.articles });
    },
  });
}

/** Delete tag. */
export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tagApi.deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags });
      qc.invalidateQueries({ queryKey: queryKeys.articles });
    },
  });
}

/** Merge source tag into target tag. */
export function useMergeTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceId,
      targetId,
    }: {
      sourceId: number;
      targetId: number;
    }) => tagApi.mergeTags(sourceId, targetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags });
      qc.invalidateQueries({ queryKey: queryKeys.articles });
    },
  });
}

// ---------------------------------------------------------------------------
// Highlight hooks
// ---------------------------------------------------------------------------

export function useHighlights(articleId: number) {
  return useQuery({
    queryKey: queryKeys.highlights(articleId),
    queryFn: () => articleApi.getHighlights(articleId),
    enabled: articleId > 0,
  });
}

export function useAddHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      articleId,
      data,
    }: {
      articleId: number;
      data: HighlightCreate;
    }) => articleApi.addHighlight(articleId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: queryKeys.highlights(variables.articleId),
      });
    },
  });
}

export function useDeleteHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      articleId,
      highlightId,
    }: {
      articleId: number;
      highlightId: number;
    }) => articleApi.deleteHighlight(articleId, highlightId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: queryKeys.highlights(variables.articleId),
      });
    },
  });
}
