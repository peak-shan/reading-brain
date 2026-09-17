/**
 * TagManagePage — view, edit, merge, and delete tags.
 */

import { useState, useCallback } from "react";
import {
  Typography,
  Card,
  Button,
  Tag,
  Input,
  ColorPicker,
  Space,
  Modal,
  Select,
  Popconfirm,
  Empty,
  Spin,
  message,
  Divider,
  Tooltip,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  MergeCellsOutlined,
  TagsOutlined,
  SaveOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useTags, useUpdateTag, useDeleteTag, useMergeTags } from "../hooks/useApi";
import type { TagWithCount } from "../types";

const { Title, Text } = Typography;

// Preset color palette for quick selection
const PRESET_COLORS = [
  "#1677ff",
  "#52c41a",
  "#faad14",
  "#f5222d",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#fa8c16",
  "#2f54eb",
  "#a0d911",
  "#3458d4",
  "#595959",
];

export default function TagManagePage() {
  const tagsQuery = useTags();
  const tags = tagsQuery.data ?? [];

  const updateMutation = useUpdateTag();
  const deleteMutation = useDeleteTag();
  const mergeMutation = useMergeTags();

  const [messageApi, contextHolder] = message.useMessage();

  // ---- Edit state ----
  const [editingTag, setEditingTag] = useState<TagWithCount | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  // ---- Merge state ----
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<number | undefined>(undefined);
  const [mergeTarget, setMergeTarget] = useState<number | undefined>(undefined);

  // ---- Handlers ----
  const startEdit = useCallback((tag: TagWithCount) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingTag(null);
    setEditName("");
    setEditColor("");
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingTag) return;
    const name = editName.trim();
    if (!name) {
      messageApi.warning("标签名不能为空");
      return;
    }
    updateMutation.mutate(
      {
        id: editingTag.id,
        data: {
          name: name !== editingTag.name ? name : undefined,
          color: editColor || undefined,
        },
      },
      {
        onSuccess: () => {
          messageApi.success("标签已更新");
          cancelEdit();
        },
        onError: (err: unknown) => {
          const detail =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
              : undefined;
          messageApi.error(detail || "更新失败");
        },
      },
    );
  }, [editingTag, editName, editColor, updateMutation, messageApi, cancelEdit]);

  const handleDelete = useCallback(
    (tagId: number) => {
      deleteMutation.mutate(tagId, {
        onSuccess: () => messageApi.success("标签已删除"),
      });
    },
    [deleteMutation, messageApi],
  );

  const handleMerge = useCallback(() => {
    if (!mergeSource || !mergeTarget) {
      messageApi.warning("请选择源标签和目标标签");
      return;
    }
    if (mergeSource === mergeTarget) {
      messageApi.warning("不能将标签合并到自身");
      return;
    }
    mergeMutation.mutate(
      { sourceId: mergeSource, targetId: mergeTarget },
      {
        onSuccess: (data) => {
          messageApi.success(
            `已合并到「${data.name}」，共 ${data.article_count} 篇文章`,
          );
          setMergeModalOpen(false);
          setMergeSource(undefined);
          setMergeTarget(undefined);
        },
        onError: (err: unknown) => {
          const detail =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
              : undefined;
          messageApi.error(detail || "合并失败");
        },
      },
    );
  }, [mergeSource, mergeTarget, mergeMutation, messageApi]);

  // ---- Render ----
  if (tagsQuery.isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <>
      {contextHolder}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          <TagsOutlined /> 标签管理
        </Title>
        <Button
          type="primary"
          icon={<MergeCellsOutlined />}
          onClick={() => setMergeModalOpen(true)}
          disabled={tags.length < 2}
        >
          合并标签
        </Button>
      </div>

      {/* Tag list */}
      {tags.length === 0 ? (
        <Empty description="还没有标签" style={{ padding: 60 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tags.map((tag) => {
            const isEditing = editingTag?.id === tag.id;

            if (isEditing) {
              return (
                <Card key={tag.id} size="small" style={{ border: "2px solid #1677ff" }}>
                  <Space direction="vertical" style={{ width: "100%" }} size="middle">
                    <div>
                      <Text strong style={{ display: "block", marginBottom: 4 }}>
                        标签名称
                      </Text>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={128}
                        onPressEnter={handleSaveEdit}
                      />
                    </div>
                    <div>
                      <Text strong style={{ display: "block", marginBottom: 4 }}>
                        颜色
                      </Text>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {PRESET_COLORS.map((c) => (
                          <Tooltip key={c} title={c}>
                            <div
                              onClick={() => setEditColor(c)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 4,
                                background: c,
                                cursor: "pointer",
                                border:
                                  editColor === c
                                    ? "3px solid #333"
                                    : "2px solid transparent",
                                boxSizing: "border-box",
                              }}
                            />
                          </Tooltip>
                        ))}
                        <Divider type="vertical" style={{ height: 28 }} />
                        <ColorPicker
                          value={editColor || undefined}
                          onChange={(_color, hex) => setEditColor(hex)}
                          size="small"
                        />
                        {editColor && (
                          <Tag color={editColor} style={{ marginLeft: 8 }}>
                            预览
                          </Tag>
                        )}
                      </div>
                    </div>
                    <Space>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSaveEdit}
                        loading={updateMutation.isPending}
                      >
                        保存
                      </Button>
                      <Button icon={<CloseOutlined />} onClick={cancelEdit}>
                        取消
                      </Button>
                    </Space>
                  </Space>
                </Card>
              );
            }

            return (
              <Card key={tag.id} size="small" hoverable>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Tag
                      color={tag.color || "default"}
                      style={{ fontSize: 14, padding: "2px 12px" }}
                    >
                      {tag.name}
                    </Tag>
                    <Text type="secondary">{tag.article_count} 篇文章</Text>
                  </div>
                  <Space>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => startEdit(tag)}
                    >
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除标签"
                      description="确定删除这个标签吗？文章不会被删除。"
                      onConfirm={() => handleDelete(tag.id)}
                      okText="删除"
                      okType="danger"
                      cancelText="取消"
                    >
                      <Button type="text" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Merge Modal */}
      <Modal
        title={
          <span>
            <MergeCellsOutlined /> 合并标签
          </span>
        }
        open={mergeModalOpen}
        onOk={handleMerge}
        onCancel={() => {
          setMergeModalOpen(false);
          setMergeSource(undefined);
          setMergeTarget(undefined);
        }}
        okText="确认合并"
        okType="danger"
        cancelText="取消"
        confirmLoading={mergeMutation.isPending}
        okButtonProps={{
          disabled: !mergeSource || !mergeTarget || mergeSource === mergeTarget,
        }}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          将源标签的所有文章合并到目标标签中，源标签将被删除。
        </Text>
        <div style={{ marginBottom: 12 }}>
          <Text strong>源标签（将被删除）：</Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            placeholder="选择要合并掉的标签"
            value={mergeSource}
            onChange={setMergeSource}
            options={tags
              .filter((t) => t.id !== mergeTarget)
              .map((t) => ({
                value: t.id,
                label: (
                  <span>
                    <Tag color={t.color || "default"} style={{ marginRight: 4 }}>
                      {t.name}
                    </Tag>
                    {t.article_count} 篇
                  </span>
                ),
              }))}
          />
        </div>
        <div>
          <Text strong>目标标签（保留）：</Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            placeholder="选择要保留的标签"
            value={mergeTarget}
            onChange={setMergeTarget}
            options={tags
              .filter((t) => t.id !== mergeSource)
              .map((t) => ({
                value: t.id,
                label: (
                  <span>
                    <Tag color={t.color || "default"} style={{ marginRight: 4 }}>
                      {t.name}
                    </Tag>
                    {t.article_count} 篇
                  </span>
                ),
              }))}
          />
        </div>
        {mergeSource && mergeTarget && mergeSource !== mergeTarget && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#fff7e6",
              borderRadius: 8,
              border: "1px solid #ffd591",
            }}
          >
            <Text>
              ⚠️ 「
              {tags.find((t) => t.id === mergeSource)?.name}
              」将合并到「
              {tags.find((t) => t.id === mergeTarget)?.name}
              」，源标签将被永久删除。
            </Text>
          </div>
        )}
      </Modal>
    </>
  );
}
