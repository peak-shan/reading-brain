/**
 * AddArticleDrawer — slides from the right side.
 *
 * Flow:
 * 1. User enters URL → clicks "Fetch & Analyze"
 * 2. Shows loading with progress hints
 * 3. Backend returns → auto-fill title, summary, key_insight, tags
 * 4. User can edit → clicks "Save"
 * 5. POST /api/articles → update with edits → close drawer, refresh list
 *
 * States: idle → fetching → ready → saving | error | duplicate
 */

import { useState, useCallback, useEffect } from "react";
import {
  Drawer,
  Input,
  Button,
  Typography,
  Skeleton,
  Alert,
  Tag,
  Space,
  Divider,
  message,
} from "antd";
import {
  LinkOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  PlusOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { articleApi } from "../services/api";
import { useTags } from "../hooks/useApi";
import type { Article } from "../types";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type Stage = "idle" | "fetching" | "ready" | "saving" | "error" | "duplicate";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddArticleDrawer({ open, onClose, onSaved }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState("");
  const [fetchProgress, setFetchProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [duplicateArticle, setDuplicateArticle] = useState<Article | null>(null);

  // Saved article ID (from fetch result, used for update on save)
  const [savedArticleId, setSavedArticleId] = useState<number | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [keyInsight, setKeyInsight] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const tagsQuery = useTags();
  const existingTags = tagsQuery.data ?? [];

  const [messageApi, contextHolder] = message.useMessage();

  // Reset state when drawer opens/closes
  useEffect(() => {
    if (open) {
      setStage("idle");
      setUrl("");
      setFetchProgress("");
      setErrorMsg("");
      setDuplicateArticle(null);
      setSavedArticleId(null);
      setTitle("");
      setSummary("");
      setKeyInsight("");
      setTags([]);
      setNewTag("");
    }
  }, [open]);

  // ---- Fetch & Analyse ----
  const handleFetch = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      messageApi.warning("请输入文章链接");
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        messageApi.error("仅支持 http 或 https 链接");
        return;
      }
    } catch {
      messageApi.error("请输入有效的链接（需包含 http:// 或 https://）");
      return;
    }

    setStage("fetching");
    setFetchProgress("正在抓取网页内容...");
    setErrorMsg("");

    try {
      // Two-phase progress indicator
      const progressTimer = setTimeout(
        () => setFetchProgress("正在生成 AI 摘要..."),
        2000,
      );

      const result = await articleApi.addArticle(trimmed);
      clearTimeout(progressTimer);

      // Detect duplicate: if saved_at is far in the past, it's an existing article
      const savedTime = new Date(result.saved_at).getTime();
      const now = Date.now();
      const isDuplicate = now - savedTime > 10_000;

      if (isDuplicate && result.title) {
        setDuplicateArticle(result);
        setStage("duplicate");
      } else {
        setSavedArticleId(result.id);
        setTitle(result.title || "");
        setSummary(result.summary || "");
        setKeyInsight(result.key_insight || "");
        setTags(result.tags.map((t) => t.name));

        // Detect fetch/AI failure from summary messages
        const summaryText = result.summary || "";
        if (summaryText.startsWith("抓取失败")) {
          setErrorMsg(summaryText);
          setStage("error");
        } else {
          // Show warnings inline for short content or AI failure
          if (summaryText.startsWith("内容过短") || summaryText.startsWith("生成失败")) {
            messageApi.warning(summaryText);
          }
          setStage("ready");
        }
      }
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      const fallback =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "抓取失败，请检查链接是否正确";
      setErrorMsg(detail || fallback);
      setStage("error");
    }
  }, [url, messageApi]);

  // ---- Save (update with edited fields) ----
  const handleSave = useCallback(async () => {
    if (!savedArticleId) {
      messageApi.error("没有可保存的文章");
      return;
    }
    setStage("saving");
    try {
      await articleApi.updateArticle(savedArticleId, {
        summary: summary || undefined,
        key_insight: keyInsight || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      messageApi.success("保存成功！");
      onSaved();
      onClose();
    } catch (err: unknown) {
      const fallback =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "未知错误";
      messageApi.error("保存失败：" + fallback);
      setStage("ready");
    }
  }, [savedArticleId, summary, keyInsight, tags, messageApi, onSaved, onClose]);

  // ---- Tag management ----
  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setNewTag("");
  };

  const removeTag = (name: string) => {
    setTags(tags.filter((t) => t !== name));
  };

  // ---- Edit form (shared between ready & error states) ----
  function renderEditForm() {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            标题
          </Text>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="文章标题"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            AI 摘要
          </Text>
          <TextArea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="文章摘要..."
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: "block", marginBottom: 4 }}>
            核心观点
          </Text>
          <Input
            value={keyInsight}
            onChange={(e) => setKeyInsight(e.target.value)}
            placeholder="一句话概括..."
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: "block", marginBottom: 8 }}>
            推荐标签
          </Text>
          <Space wrap style={{ marginBottom: 8 }}>
            {tags.map((t) => (
              <Tag key={t} closable onClose={() => removeTag(t)} color="blue">
                {t}
              </Tag>
            ))}
          </Space>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              placeholder="添加标签"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onPressEnter={addTag}
              style={{ width: "70%" }}
            />
            <Button onClick={addTag} icon={<PlusOutlined />}>
              添加
            </Button>
          </Space.Compact>
          {existingTags.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已有标签：
              </Text>
              <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
                {existingTags
                  .filter((t) => !tags.includes(t.name))
                  .slice(0, 8)
                  .map((t) => (
                    <Tag
                      key={t.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (!tags.includes(t.name)) {
                          setTags([...tags, t.name]);
                        }
                      }}
                    >
                      + {t.name}
                    </Tag>
                  ))}
              </Space>
            </div>
          )}
        </div>

        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </Space>
      </div>
    );
  }

  // ---- Render ----
  return (
    <Drawer
      title="添加新文章"
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
      extra={<Button icon={<CloseOutlined />} onClick={onClose} type="text" />}
    >
      {contextHolder}

      {/* URL Input — always visible */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: "block", marginBottom: 8 }}>
          文章链接
        </Text>
        <Input
          placeholder="https://example.com/article"
          prefix={<LinkOutlined />}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPressEnter={stage === "idle" ? handleFetch : undefined}
          disabled={stage === "fetching" || stage === "saving"}
          size="large"
        />
      </div>

      {/* Fetch button */}
      {stage === "idle" && (
        <Button
          type="primary"
          icon={<LinkOutlined />}
          onClick={handleFetch}
          block
          size="large"
        >
          抓取并分析
        </Button>
      )}

      {/* Fetching */}
      {stage === "fetching" && (
        <div style={{ padding: "24px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <LoadingOutlined style={{ fontSize: 32, color: "#1677ff" }} spin />
            <Paragraph style={{ marginTop: 12 }}>
              <Text type="secondary">{fetchProgress}</Text>
            </Paragraph>
          </div>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      )}

      {/* Error */}
      {stage === "error" && (
        <div>
          <Alert
            type="error"
            showIcon
            icon={<ExclamationCircleFilled />}
            message="抓取失败"
            description={errorMsg}
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">您可以检查链接后重试，或手动填写下方内容</Text>
          <Divider />
          {renderEditForm()}
        </div>
      )}

      {/* Duplicate */}
      {stage === "duplicate" && duplicateArticle && (
        <div>
          <Alert
            type="info"
            showIcon
            icon={<CheckCircleFilled />}
            message="这篇文章已经收藏过了"
            description={
              <div>
                <Text strong>{duplicateArticle.title}</Text>
                <br />
                <Text type="secondary">
                  保存于{" "}
                  {new Date(duplicateArticle.saved_at).toLocaleDateString()}
                </Text>
              </div>
            }
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" onClick={onClose} block>
            知道了
          </Button>
        </div>
      )}

      {/* Ready — editable form */}
      {stage === "ready" && renderEditForm()}

      {/* Saving */}
      {stage === "saving" && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <LoadingOutlined style={{ fontSize: 32, color: "#1677ff" }} spin />
          <Paragraph style={{ marginTop: 12 }}>
            <Text type="secondary">正在保存...</Text>
          </Paragraph>
        </div>
      )}
    </Drawer>
  );
}
