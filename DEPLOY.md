# Reading Brain — 部署清单

> 轻量版 Readwise / 第二大脑，基于 FastAPI + React + SQLite，支持 AI 摘要、自动标签、全文搜索。

---

## 一、环境要求

| 组件 | 版本 | 用途 |
|------|------|------|
| Python | ≥ 3.11 | 后端运行时 |
| Node.js | ≥ 18 | 前端构建与开发 |
| npm | ≥ 9 | 前端包管理 |
| SQLite | ≥ 3.35（支持 FTS5） | 数据库（内置，无需额外安装） |

---

## 二、项目结构

```
reading-brain/
├── backend/                    # 后端 (FastAPI)
│   ├── app/
│   │   ├── main.py             # 应用入口
│   │   ├── config.py           # 配置（从 .env 加载）
│   │   ├── database.py         # 数据库初始化、FTS5 建表
│   │   ├── models/             # SQLAlchemy ORM 模型
│   │   │   ├── article.py
│   │   │   ├── tag.py
│   │   │   └── highlight.py
│   │   ├── schemas/            # Pydantic 请求/响应模型
│   │   ├── routers/            # API 路由
│   │   │   ├── articles.py     # 文章 CRUD + 搜索
│   │   │   └── tags.py         # 标签管理
│   │   └── services/           # 业务逻辑
│   │       ├── fetcher.py      # 网页抓取（Jina → Trafilatura → 直接抓取）
│   │       ├── ai.py           # AI 摘要 + 自动标签（火山方舟）
│   │       └── search.py       # FTS5 全文搜索 + jieba 分词
│   ├── .env                    # 环境变量（⚠️ 不要提交到 Git）
│   ├── .env.example            # 环境变量模板
│   ├── requirements.txt        # Python 依赖
│   └── reading_brain.db        # SQLite 数据库（运行时生成）
│
├── frontend/                   # 前端 (React + TypeScript + Vite)
│   ├── src/
│   │   ├── App.tsx             # 路由配置
│   │   ├── components/         # 组件（AppLayout、ArticleCard、AddArticleDrawer）
│   │   ├── pages/              # 页面（Home、ArticleDetail、TagManage）
│   │   ├── services/api.ts     # API 请求层（axios）
│   │   ├── hooks/useApi.ts     # React Query hooks
│   │   ├── stores/appStore.ts  # Zustand 状态管理
│   │   └── types/index.ts      # TypeScript 类型定义
│   ├── package.json
│   ├── vite.config.ts          # Vite 配置（含 API 代理）
│   └── tsconfig.json
│
├── .gitignore
└── DEPLOY.md                   # 本文件
```

---

## 三、环境变量配置

在 `backend/.env` 中配置（复制 `.env.example` 并修改）：

```bash
# 数据库（默认 SQLite，无需修改）
DATABASE_URL=sqlite:///./reading_brain.db

# 火山方舟 API（AI 摘要 + 自动标签）
# 前往 https://console.volcengine.com/ark 获取
VOLCANO_API_KEY=your_api_key_here
VOLCANO_MODEL_ID=your_model_id_here
VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 应用配置
APP_HOST=0.0.0.0
APP_PORT=8000
```

> ⚠️ **火山方舟 API 为可选项**：未配置时，AI 摘要和自动标签功能不可用，但文章抓取、存储、搜索、标签管理等功能仍可正常使用。

---

## 四、本地开发部署

### 1. 克隆项目

```bash
git clone <your-repo-url> reading-brain
cd reading-brain
```

### 2. 后端启动

```bash
cd backend

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入火山方舟 API key（可选）

# 启动后端（开发模式，自动重载）
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端地址：http://localhost:8000
API 文档：http://localhost:8000/docs

### 3. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动前端（开发模式，含 HMR）
npm run dev
```

前端地址：http://localhost:5173

> Vite 已配置代理，`/api` 请求自动转发到后端 `http://127.0.0.1:8000`。

---

## 五、生产部署

### 方案 A：直接部署（推荐小团队/个人使用）

#### 后端

```bash
cd backend
pip install -r requirements.txt

# 使用 gunicorn + uvicorn workers 生产部署
pip install gunicorn
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

#### 前端

```bash
cd frontend
npm install
npm run build

# 产物在 dist/ 目录，用 Nginx 托管
```

#### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/reading-brain/frontend/dist;
        try_files $uri $uri/ /index.html;  # SPA 路由回退
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 方案 B：Docker 部署

#### Dockerfile（后端）

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY backend/ .
ENV APP_HOST=0.0.0.0 APP_PORT=8000

EXPOSE 8000
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

#### Dockerfile（前端）

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8000:8000"
    env_file:
      - backend/.env
    volumes:
      - db_data:/app
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  db_data:
```

---

## 六、关键依赖说明

### 后端 Python 依赖

| 包名 | 用途 |
|------|------|
| fastapi | Web 框架 |
| uvicorn | ASGI 服务器 |
| sqlalchemy | ORM + 数据库管理 |
| pydantic / pydantic-settings | 数据校验 + 配置管理 |
| httpx | HTTP 客户端（抓取网页 + AI API） |
| python-dotenv | .env 文件加载 |
| trafilatura | HTML → 纯文本提取（备用抓取方案） |
| jieba | 中文分词（FTS5 索引） |

### 前端 npm 依赖

| 包名 | 用途 |
|------|------|
| react / react-dom | UI 框架 |
| react-router-dom | 路由 |
| antd | UI 组件库 |
| axios | HTTP 请求 |
| @tanstack/react-query | 数据获取 + 缓存 |
| zustand | 全局状态管理 |
| dayjs | 日期处理 |
| vite | 构建工具 |

---

## 七、功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 添加文章（URL 抓取） | ✅ | 支持 Jina → Trafilatura → 直接抓取三级降级 |
| AI 摘要 + 自动标签 | ✅ | 火山方舟 API（需配置 API key） |
| 文章列表 | ✅ | 分页、状态筛选、标签筛选、排序 |
| 全文搜索 | ✅ | FTS5 + jieba 分词，标题/摘要/正文/标签加权 |
| 文章详情 | ✅ | 阅读状态切换、收藏、高亮标注 |
| 标签管理 | ✅ | 重命名、改色、合并、删除 |
| 异常处理 | ✅ | 无效 URL、抓取失败、AI 超时、内容过短/过长 |
| 性能 | ✅ | 列表 < 5ms，搜索 < 5ms，详情 < 4ms |

---

## 八、注意事项

1. **数据库备份**：SQLite 为单文件，定期备份 `reading_brain.db` 即可
2. **反爬限制**：百度百科、微信公众号等有反爬机制的网站无法自动抓取，需手动粘贴内容
3. **FTS5 索引**：使用 jieba 预分词 + 独立虚拟表，首次启动或 schema 变更时自动重建索引
4. **安全**：生产环境请修改 `APP_HOST` 为实际域名，配置 HTTPS
5. **AI API 费用**：火山方舟按 token 计费，请留意用量
