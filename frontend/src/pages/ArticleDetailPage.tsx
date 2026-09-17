/**
 * ArticleDetailPage — full article view with reading, notes, highlights.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Button,
  Tag,
  Card,
  Collapse,
  Space,
  Input,
  Divider,
  Spin,
  Empty,
  Dropdown,
  Popconfirm,
  message,
  Tooltip,
  Modal,
} from "antd";
import {
  ArrowLeftOutlined,
  StarOutlined,
  StarFilled,
  InboxOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  HighlightOutlined,
  BookOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  useArticle,
  useUpdateArticle,
  useHighlights,
  useAddHighlight,
  useDeleteHighlight,
} from "../hooks/useApi";
import type { ReadStatus } from "../types";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const statusOptions: { key: ReadStatus; label: string; icon: React.ReactNode }[] = [
  { key: "unread", label: "未读", icon: <InboxOutlined /> },
  { key: "reading", label: "在读", icon: <EyeOutlined /> },
  { key: "read", label: "已读", icon: <CheckCircleOutlined /> },
];

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const articleId = id ? parseInt(id, 10) : 0;

  const [messageApi, contextHolder] = message.useMessage();
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [highlightText, setHighlightText] = useState("");
  const [highlightNote, setHighlightNote] = useState("");
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Data
  const articleQuery = useArticle(articleId);
  const highlightsQuery = useHighlights(articleId);
  const updateMutation = useUpdateArticle();
  const addHighlightMutation = useAddHighlight();
  const deleteHighlightMutation = useDeleteHighlight();

  const article = articleQuery.data;
  const highlights = highlightsQuery.data ?? [];

  // Sync note from article
  useEffect(() => {
    if (article) {
      setNoteText(article.note || "");
    }
  }, [article]);

  // ---- Text selection → highlight ----
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString().trim();
    if (text.length < 2) return;

    // Check selection is within content area
    if (contentRef.current && selection.anchorNode) {
      if (!contentRef.current.contains(selection.anchorNode)) return;
    }

    setHighlightText(text);
    setHighlightNote("");
    setShowHighlightModal(true);
    selection.removeAllRanges();
  }, []);

  const handleAddHighlight = useCallback(() => {
    if (!highlightText.trim()) return;
    addHighlightMutation.mutate(
      {
        articleId,
        data: { text: highlightText, note: highlightNote || undefined },
      },
      {
        onSuccess: () => {
          messageApi.success("已添加高亮");
          setShowHighlightModal(false);
        },
      },
    );
  }, [articleId, highlightText, highlightNote, addHighlightMutation, messageApi]);

  // ---- Actions ----
  const handleStatusChange = useCallback(
    (status: ReadStatus) => {
      updateMutation.mutate(
        { id: articleId, data: { read_status: status } },
        { onSuccess: () => messageApi.success("状态已更新") },
      );
    },
    [articleId, updateMutation, messageApi],
  );

  const handleToggleFavorite = useCallback(() => {
    if (!article) return;
    updateMutation.mutate(
      { id: articleId, data: { favorite: !article.favorite } },
      {
        onSuccess: () =>
          messageApi.success(article.favorite ? "已取消收藏" : "已收藏"),
      },
    );
  }, [article, articleId, updateMutation, messageApi]);

  const handleSaveNote = useCallback(() => {
    updateMutation.mutate(
      { id: articleId, data: { note: noteText } },
      {
        onSuccess: () => {
          messageApi.success("笔记已保存");
          setEditingNote(false);
        },
      },
    );
  }, [articleId, noteText, updateMutation, messageApi]);

  const handleDeleteHighlight = useCallback(
    (highlightId: number) => {
      deleteHighlightMutation.mutate(
        { articleId, highlightId },
        { onSuccess: () => messageApi.success("已删除高亮") },
      );
    },
    [articleId, deleteHighlightMutation, messageApi],
  );

  // ---- Loading / Error ----
  if (articleQuery.isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (articleQuery.isError || !article) {
    return (
      <div style={{ padding: 40 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>
          返回列表
        </Button>
        <Empty description="文章不存在或加载失败" style={{ marginTop: 40 }} />
      </div>
    );
  }

  const statusInfo = statusOptions.find((s) => s.key === article.read_status);

  return (
    <>
      {contextHolder}

      {/* Back button */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/")}
        style={{ marginBottom: 16 }}
      >
        返回列表
      </Button>

      {/* ---- Header ---- */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Title level={3} style={{ flex: 1, margin: 0 }}>
            {article.title || "无标题"}
          </Title>
          <Tooltip title={article.favorite ? "取消收藏" : "收藏"}>
            <Button
              type="text"
              size="large"
              icon={
                article.favorite ? (
                  <StarFilled style={{ color: "#faad14" }} />
                ) : (
                  <StarOutlined />
                )
              }
              onClick={handleToggleFavorite}
            />
          </Tooltip>
        </div>

        {/* Meta */}
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">
            {[
              article.site_name,
              article.author,
              article.saved_at
                ? dayjs(article.saved_at).format("YYYY-MM-DD HH:mm")
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </Text>
        </div>

        {/* Tags + Status */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {article.tags.map((t) => (
            <Tag key={t.id} color={t.color || "default"}>
              {t.name}
            </Tag>
          ))}
          <Divider type="vertical" />
          <Dropdown
            menu={{
              items: statusOptions.map((s) => ({
                key: s.key,
                icon: s.icon,
                label: s.label,
              })),
              onClick: ({ key }) => handleStatusChange(key as ReadStatus),
            }}
          >
            <Button size="small" icon={statusInfo?.icon}>
              {statusInfo?.label || article.read_status}
              <EditOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Button>
          </Dropdown>
        </div>
      </div>

      {/* ---- AI Summary (collapsible) ---- */}
      {article.summary && (
        <Collapse
          ghost
          defaultActiveKey={["summary"]}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: "summary",
              label: (
                <Text strong>
                  <BookOutlined /> AI 摘要
                </Text>
              ),
              children: (
                <Paragraph style={{ marginBottom: 0, lineHeight: 1.8 }}>
                  {article.summary}
                </Paragraph>
              ),
            },
          ]}
        />
      )}

      {/* ---- Key Insight ---- */}
      {article.key_insight && (
        <Card
          size="small"
          style={{
            marginBottom: 24,
            borderLeft: "4px solid #1677ff",
            background: "#f6f8fa",
          }}
        >
          <Text strong>💡 核心观点：</Text>
          <Text>{article.key_insight}</Text>
        </Card>
      )}

      {/* ---- Content ---- */}
      <Divider>正文</Divider>
      <div
        ref={contentRef}
        onMouseUp={handleMouseUp}
        style={{
          maxWidth: 720,
          margin: "0 auto",
          lineHeight: 1.8,
          fontSize: 16,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "#333",
          userSelect: "text",
          cursor: "text",
          padding: "0 8px",
        }}
      >
        {article.content || (
          <Text type="secondary">暂无正文内容</Text>
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          💡 选中正文文本可添加高亮
        </Text>
      </div>

      {/* ---- Notes ---- */}
      <Divider>我的笔记</Divider>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {editingNote ? (
          <div>
            <TextArea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="写下你的想法..."
              autoSize={{ minRows: 4, maxRows: 12 }}
              autoFocus
            />
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" onClick={handleSaveNote}>
                保存笔记
              </Button>
              <Button
                onClick={() => {
                  setNoteText(article.note || "");
                  setEditingNote(false);
                }}
              >
                取消
              </Button>
            </Space>
          </div>
        ) : (
          <div>
            {article.note ? (
              <Paragraph
                style={{
                  background: "#fffbe6",
                  padding: 16,
                  borderRadius: 8,
                  whiteSpace: "pre-wrap",
                }}
              >
                {article.note}
              </Paragraph>
            ) : (
              <Text type="secondary">还没有笔记，点击下方按钮开始记录</Text>
            )}
            <Button
              icon={<EditOutlined />}
              onClick={() => setEditingNote(true)}
              style={{ marginTop: 8 }}
            >
              {article.note ? "编辑笔记" : "添加笔记"}
            </Button>
          </div>
        )}
      </div>

      {/* ---- Highlights ---- */}
      <Divider>高亮片段</Divider>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {highlights.length === 0 ? (
          <Text type="secondary">还没有高亮，选中正文文本来添加</Text>
        ) : (
          <div>
            {highlights.map((h) => (
              <div
                key={h.id}
                style={{
                  background: "#fffbe6",
                  borderLeft: "3px solid #fadb14",
                  padding: "12px 16px",
                  marginBottom: 12,
                  borderRadius: "0 8px 8px 0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Text style={{ fontStyle: "italic" }}>"{h.text}"</Text>
                  <Popconfirm
                    title="删除这条高亮？"
                    onConfirm={() => handleDeleteHighlight(h.id)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
                {h.note && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">— {h.note}</Text>
                  </div>
                )}
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(h.created_at).format("MM-DD HH:mm")}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Highlight Modal ---- */}
      <Modal
        title={
          <span>
            <HighlightOutlined /> 添加高亮
          </span>
        }
        open={showHighlightModal}
        onOk={handleAddHighlight}
        onCancel={() => setShowHighlightModal(false)}
        okText="保存高亮"
        cancelText="取消"
        confirmLoading={addHighlightMutation.isPending}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">选中的文本：</Text>
          <div
            style={{
              background: "#fffbe6",
              padding: "8px 12px",
              borderRadius: 4,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            "{highlightText}"
          </div>
        </div>
        <div>
          <Text strong>批注（可选）：</Text>
          <TextArea
            value={highlightNote}
            onChange={(e) => setHighlightNote(e.target.value)}
            placeholder="写下你对这段话的想法..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            style={{ marginTop: 4 }}
          />
        </div>
      </Modal>
    </>
  );
}
