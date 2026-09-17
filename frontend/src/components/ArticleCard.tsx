/**
 * ArticleCard — displays a single article in the list.
 *
 * Shows: title, site+date, summary (2-line clamp), tags, read status.
 * Click → navigate to detail. Right-click → context menu.
 */

import { Card, Tag, Typography, Dropdown } from "antd";
import {
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { Article } from "../types";
import dayjs from "dayjs";

const { Text, Paragraph } = Typography;

const statusLabels: Record<string, { label: string; color: string }> = {
  unread: { label: "未读", color: "blue" },
  reading: { label: "在读", color: "orange" },
  read: { label: "已读", color: "green" },
  processing: { label: "处理中", color: "default" },
};

interface Props {
  article: Article;
  onToggleFavorite?: (id: number, fav: boolean) => void;
  onMarkRead?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export default function ArticleCard({
  article,
  onToggleFavorite,
  onMarkRead,
  onDelete,
}: Props) {
  const navigate = useNavigate();
  const a = article;
  const st = statusLabels[a.read_status] ?? statusLabels.unread;

  const contextMenuItems = [
    {
      key: "read",
      icon: <CheckCircleOutlined />,
      label: "标记已读",
      onClick: () => onMarkRead?.(a.id),
    },
    {
      key: "fav",
      icon: a.favorite ? <StarFilled /> : <StarOutlined />,
      label: a.favorite ? "取消收藏" : "收藏",
      onClick: () => onToggleFavorite?.(a.id, !a.favorite),
    },
    { type: "divider" as const },
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除",
      danger: true,
      onClick: () => onDelete?.(a.id),
    },
  ];

  return (
    <Dropdown menu={{ items: contextMenuItems }} trigger={["contextMenu"]}>
      <Card
        hoverable
        size="small"
        onClick={() => navigate(`/article/${a.id}`)}
        styles={{ body: { padding: "16px 20px" } }}
        style={{ marginBottom: 12 }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text
            strong
            style={{
              fontSize: 16,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {a.title || a.url}
          </Text>
          <Tag color={st.color} style={{ marginRight: 0 }}>
            {st.label}
          </Tag>
          {a.favorite && (
            <StarFilled style={{ color: "#faad14", fontSize: 16 }} />
          )}
        </div>

        {/* Meta row */}
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {[a.site_name, a.saved_at ? dayjs(a.saved_at).format("YYYY-MM-DD") : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </Text>
        </div>

        {/* Summary */}
        <Paragraph
          type="secondary"
          ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}
          style={{ marginBottom: 8, fontSize: 14 }}
        >
          {a.summary || a.content?.slice(0, 200) || "暂无摘要"}
        </Paragraph>

        {/* Tags */}
        {a.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {a.tags.map((t) => (
              <Tag
                key={t.id}
                color={t.color || "default"}
                style={{ cursor: "pointer", marginBottom: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  // Could trigger tag filter — for now just visual
                }}
              >
                {t.name}
              </Tag>
            ))}
          </div>
        )}
      </Card>
    </Dropdown>
  );
}
