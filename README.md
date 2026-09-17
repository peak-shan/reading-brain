# Reading Brain 🧠

> 轻量版 Readwise / 第二大脑 — AI 稍后读 + 个人知识库

基于 **FastAPI + React + SQLite**，支持网页抓取、AI 摘要、自动标签、全文搜索。

## ✨ 功能

- 🔗 **一键收藏** — 输入 URL，自动抓取内容并保存
-  **AI 摘要** — 自动生成 2-3 句摘要 + 核心观点 + 关键词标签
- 🔍 **全文搜索** — FTS5 + jieba 中文分词，标题/摘要/正文加权检索
- 🏷️ **标签管理** — 自动标签 + 手动管理，支持合并、重命名、改色
-  **阅读管理** — 未读/在读/已读/收藏状态流转
- ️ **高亮标注** — 文章内高亮重点段落
- ⚡ **极速响应** — 列表 < 5ms，搜索 < 5ms

## 🚀 快速开始

### 环境要求

- Python ≥ 3.11
- Node.js ≥ 18
- SQLite ≥ 3.35（内置，无需安装）

### 后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 按需配置火山方舟 API key
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 即可使用。

##  生产部署

详见 [DEPLOY.md](./DEPLOY.md)，包含：

- Nginx 静态托管 + API 代理
- Docker / docker-compose 部署
- Gunicorn 生产服务器配置

##  技术栈

| 层 | 技术 |
|---|------|
| 后端 | FastAPI, SQLAlchemy, SQLite FTS5 |
| 前端 | React 19, TypeScript, Ant Design, React Query |
| AI | 火山方舟（Volcano Ark）LLM API |
| 抓取 | Jina Reader → Trafilatura → httpx 三级降级 |
| 搜索 | FTS5 + jieba 中文分词 |

##  许可证

MIT
