/**
 * HomePage — main article list page.
 *
 * Layout:
 * ┌─ sidebar (status filters + tag list) ─┬─ main (search + cards + pagination) ─┐
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Typography,
  Input,
  Button,
  Pagination,
  Spin,
  Empty,
  Badge,
  Menu,
  Row,
  Col,
  message,
  Modal,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  InboxOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  StarOutlined,
  TagsOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import ArticleCard from "../components/ArticleCard";
import {
  useArticles,
  useTags,
  useSearchArticles,
  useDeleteArticle,
  useUpdateArticle,
} from "../hooks/useApi";
import AddArticleDrawer from "../components/AddArticleDrawer";
import type { ArticleListParams, ReadStatus } from "../types";

const { Title, Text } = Typography;

const PAGE_SIZE = 15;

export default function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();

  // ---- state ----
  const [statusFilter, setStatusFilter] = useState<string>("all"); // all | unread | reading | read | favorite
  const [tagFilter, setTagFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [messageApi, contextHolder] = message.useMessage();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Open drawer when URL has ?drawer=add (from nav bar click)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("drawer") === "add") {
      setDrawerOpen(true);
      // Clean up query so drawer highlight works correctly
      navigate("/", { replace: true });
    }
  }, [location.search, navigate]);

  // ---- debounce search ----
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1); // reset page on new search
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [searchQuery]);

  // ---- build query params ----
  const listParams: ArticleListParams = useMemo(() => {
    const p: ArticleListParams = { page, page_size: PAGE_SIZE, sort: "desc" };
    if (statusFilter === "favorite") {
      p.favorite = true;
    } else if (statusFilter !== "all") {
      p.status = statusFilter as ReadStatus;
    }
    if (tagFilter) p.tag = tagFilter;
    return p;
  }, [page, statusFilter, tagFilter]);

  // ---- data fetching ----
  const isSearching = debouncedQuery.trim().length > 0;

  const articlesQuery = useArticles(isSearching ? undefined : listParams);
  const searchQuery2 = useSearchArticles(
    isSearching ? debouncedQuery : "",
    page,
    PAGE_SIZE,
  );
  const tagsQuery = useTags();

  // Pick the active data source
  const activeQuery = isSearching ? searchQuery2 : articlesQuery;
  const articles = isSearching
    ? (searchQuery2.data?.items.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        content: null,
        content_html: null,
        summary: item.summary,
        key_insight: null,
        author: item.author,
        site_name: item.site_name,
        published_at: null,
        saved_at: item.saved_at || "",
        read_status: (item.read_status || "unread") as ReadStatus,
        favorite: item.favorite || false,
        note: null,
        tags: item.tags,
      })) ?? [])
    : (articlesQuery.data?.items ?? []);

  const total = activeQuery.data?.total ?? 0;
  const totalPages = isSearching
    ? (searchQuery2.data?.pages ?? 0)
    : (articlesQuery.data?.pages ?? 0);

  // ---- mutations ----
  const deleteMutation = useDeleteArticle();
  const updateMutation = useUpdateArticle();

  const handleDelete = useCallback(
    (id: number) => {
      Modal.confirm({
        title: "确认删除",
        content: "删除后不可恢复，确定要删除这篇文章吗？",
        okText: "删除",
        okType: "danger",
        cancelText: "取消",
        onOk: () =>
          deleteMutation.mutateAsync(id).then(() => {
            messageApi.success("已删除");
          }),
      });
    },
    [deleteMutation, messageApi],
  );

  const handleToggleFavorite = useCallback(
    (id: number, fav: boolean) => {
      updateMutation.mutateAsync({ id, data: { favorite: fav } }).then(() => {
        messageApi.success(fav ? "已收藏" : "已取消收藏");
      });
    },
    [updateMutation, messageApi],
  );

  const handleMarkRead = useCallback(
    (id: number) => {
      updateMutation
        .mutateAsync({ id, data: { read_status: "read" } })
        .then(() => {
          messageApi.success("已标记为已读");
        });
    },
    [updateMutation, messageApi],
  );

  // ---- sidebar menu ----
  const tags = tagsQuery.data ?? [];

  const statusMenuItems = [
    {
      key: "all",
      icon: <AppstoreOutlined />,
      label: "全部",
    },
    {
      key: "unread",
      icon: <InboxOutlined />,
      label: "未读",
    },
    {
      key: "reading",
      icon: <EyeOutlined />,
      label: "在读",
    },
    {
      key: "read",
      icon: <CheckCircleOutlined />,
      label: "已读",
    },
    {
      key: "favorite",
      icon: <StarOutlined />,
      label: "收藏",
    },
  ];

  const tagMenuItems = tags.map((t) => ({
    key: t.name,
    icon: <TagsOutlined />,
    label: (
      <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        <span>{t.name}</span>
        <Badge
          count={t.article_count}
          style={{ backgroundColor: t.color || "#999", marginLeft: 8 }}
          size="small"
        />
      </span>
    ),
  }));

  const loading = activeQuery.isLoading;

  return (
    <>
      {contextHolder}
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          📚 AI稍后读
        </Title>
        <Input
          placeholder="搜索文章..."
          prefix={<SearchOutlined />}
          allowClear
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, maxWidth: 400 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setDrawerOpen(true)}
        >
          添加
        </Button>
      </div>

      <Row gutter={24}>
        {/* ---- Left sidebar ---- */}
        <Col xs={24} sm={6} md={5}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>
            状态筛选
          </Text>
          <Menu
            mode="inline"
            selectedKeys={tagFilter ? [] : [statusFilter]}
            items={statusMenuItems}
            onClick={({ key }) => {
              setStatusFilter(key);
              setTagFilter(undefined);
              setPage(1);
            }}
            style={{ border: "none", marginBottom: 16 }}
          />

          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>
            — 标签 —
          </Text>
          {tagsQuery.isLoading ? (
            <Spin size="small" />
          ) : (
            <Menu
              mode="inline"
              selectedKeys={tagFilter ? [tagFilter] : []}
              items={tagMenuItems}
              onClick={({ key }) => {
                setTagFilter(key === tagFilter ? undefined : key);
                setPage(1);
              }}
              style={{ border: "none" }}
            />
          )}
        </Col>

        {/* ---- Main content ---- */}
        <Col xs={24} sm={18} md={19}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 80 }}>
              <Spin size="large" />
            </div>
          ) : articles.length === 0 ? (
            <Empty
              description={
                isSearching
                  ? `未找到与「${debouncedQuery}」相关的文章`
                  : "还没有保存任何文章，点击右上角开始收藏吧"
              }
              style={{ padding: 60 }}
            />
          ) : (
            <>
              {isSearching && (
                <Text type="secondary" style={{ marginBottom: 12, display: "block" }}>
                  搜索「{debouncedQuery}」— 共 {total} 条结果
                </Text>
              )}
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onToggleFavorite={handleToggleFavorite}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDelete}
                />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ textAlign: "center", marginTop: 24, marginBottom: 16 }}>
                  <Pagination
                    current={page}
                    total={total}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                    showSizeChanger={false}
                    showQuickJumper
                  />
                </div>
              )}
            </>
          )}
        </Col>
      </Row>

      {/* Add Article Drawer */}
      <AddArticleDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          // Refresh article list after saving
          articlesQuery.refetch();
          tagsQuery.refetch();
        }}
      />
    </>
  );
}
