# Reading Brain — 部署指南

> 轻量版 Readwise / 第二大脑，基于 FastAPI + React + SQLite，支持 AI 摘要、自动标签、全文搜索、多用户认证。

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
│   │   ├── main.py             # 应用入口（认证中间件 + SPA 托管）
│   │   ├── config.py           # 配置（从 .env 加载）
│   │   ├── database.py         # 数据库初始化、FTS5 建表、users 表
│   │   ├── auth.py             # 认证模块（密码哈希、JWT、角色校验）
│   │   ├── models/             # SQLAlchemy ORM 模型
│   │   │   ├── article.py
│   │   │   ├── tag.py
│   │   │   └── highlight.py
│   │   ├── routers/            # API 路由
│   │   │   ├── articles.py     # 文章 CRUD + 搜索
│   │   │   ├── tags.py         # 标签管理
│   │   │   └── auth.py         # 登录、改密、用户管理
│   │   └── services/           # 业务逻辑
│   │       ├── fetcher.py      # 网页抓取（Jina → Trafilatura → 直接抓取）
│   │       ├── ai.py           # AI 摘要 + 自动标签（火山方舟）
│   │       └── search.py       # FTS5 全文搜索 + jieba 分词
│   ├── .env                    # 环境变量（️ 不要提交到 Git）
│   ├── .env.example            # 环境变量模板
│   ├── requirements.txt        # Python 依赖
│   ── reading_brain.db        # SQLite 数据库（运行时生成）
│
├── frontend/                   # 前端 (React + TypeScript + Vite)
│   ├── src/
│   │   ├── App.tsx             # 路由配置 + 认证守卫
│   │   ├── components/         # 组件
│   │   │   ├── AppLayout.tsx          # 布局（含用户菜单）
│   │   │   ├── ChangePasswordModal.tsx # 修改密码弹窗
│   │   │   ── CreateSubAccountModal.tsx # 创建子账号弹窗
│   │   ├── pages/              # 页面
│   │   │   ├── LoginPage.tsx          # 登录页
│   │   │   ├── HomePage.tsx           # 文章列表
│   │   │   ├── ArticleDetailPage.tsx  # 文章详情
│   │   │   └── TagManagePage.tsx      # 标签管理
│   │   ── services/api.ts     # API 请求层（axios + 认证拦截器）
│   ├── package.json
│   └── vite.config.ts          # Vite 配置（含 API 代理）
│
├── DEPLOY.md                   # 本文件
└── README.md                   # 项目说明
```

---

## 三、环境变量配置

复制 `backend/.env.example` 为 `backend/.env`，填入以下变量：

```bash
# 数据库（默认 SQLite，无需修改）
DATABASE_URL=sqlite:///./reading_brain.db

# 火山方舟 API（AI 摘要 + 自动标签）
# 前往 https://console.volcengine.com/ark 获取
VOLCANO_API_KEY=your_api_key_here
VOLCANO_MODEL_ID=your_model_id_here
VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# JWT 认证密钥（留空则每次启动自动生成，但重启后需重新登录）
# 生产环境务必设置为固定值
JWT_SECRET_KEY=your-secret-key-here

# 应用配置
APP_HOST=0.0.0.0
APP_PORT=8000

# CORS 允许的来源（逗号分隔，生产环境填你的域名）
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

> ⚠️ **火山方舟 API 为可选项**：未配置时，AI 摘要和自动标签功能不可用，但文章抓取、存储、搜索、标签管理等功能仍可正常使用。

---

## 四、本地开发部署

### 1. 克隆项目

```bash
git clone https://github.com/peak-shan/reading-brain.git
cd reading-brain
```

### 2. 后端启动

```bash
cd backend

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入火山方舟 API key（可选）和 JWT_SECRET_KEY

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

### 4. 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123456 | 管理员 |

登录后请在右上角菜单修改默认密码。

---

## 五、生产部署

### 方案 A：Render 一键部署（推荐）

在 [Render](https://render.com) 创建 **Web Service**，连接 GitHub 仓库后配置：

| 配置项 | 值 |
|--------|-----|
| **Root Directory** | 留空（根目录） |
| **Build Command** | `cd frontend && npm install && npm run build && cd ../backend && pip install -r requirements.txt` |
| **Start Command** | `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

**环境变量**（Render → Environment）：

| Key | Value |
|-----|-------|
| `JWT_SECRET_KEY` | 任意随机字符串（如 `my-super-secret-key-2026`） |
| `VOLCANO_API_KEY` | 你的火山方舟 Key |
| `VOLCANO_MODEL_ID` | 你的模型 ID |
| `VOLCANO_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` |
| `CORS_ORIGINS` | `https://你的服务名.onrender.com` |

> 原理：FastAPI 在生产模式下自动托管 `frontend/dist/` 静态文件，API 和前端共用一个端口，无需 Nginx 反向代理。

### 方案 B：自建服务器（Nginx + Gunicorn）

#### 后端

```bash
cd backend
pip install -r requirements.txt gunicorn

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
# 产物在 dist/ 目录
```

#### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件（由 FastAPI 托管，也可独立部署）
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 方案 C：Docker 部署

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 前端构建
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci && npm run build

# 后端依赖
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 代码
COPY backend/ ./backend/
COPY frontend/dist/ ./frontend/dist/

ENV APP_HOST=0.0.0.0 APP_PORT=8000
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 六、用户与权限

### 默认账号

首次启动时自动创建管理员账号：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123456 | 管理员 |

### 角色说明

| 功能 | admin（管理员） | sub（子账号） |
|------|:-:|:-:|
| 登录 | ✅ | ✅ |
| 修改自己的密码 | ✅ | ✅ |
| 浏览/搜索文章 | ✅ | ✅ |
| 添加/编辑/删除文章 | ✅ | ✅ |
| 标签管理 | ✅ | ✅ |
| **创建子账号** | ✅ | ❌ 403 |
| **查看所有用户** | ✅ | ❌ 403 |
| **删除子账号** | ✅ | ❌ 403 |

### 管理员操作

右上角用户菜单（显示 `(管理员)` 标识）：

- **创建子账号**：设置用户名和密码（3-20 字符，密码 ≥ 6 字符）
- **子账号管理**：查看所有用户列表，可删除子账号（admin 不可删除）
- **修改密码**：修改自己的登录密码
- **退出登录**：清除 token，返回登录页

### 安全说明

- 密码使用 PBKDF2-HMAC-SHA256（10 万次迭代）+ 随机盐值哈希存储
- JWT token 有效期 7 天，存储在前端 localStorage
- 所有 API 路由（除 `/api/health` 和 `/api/auth/login`）均需有效 token
- 生产环境务必设置固定的 `JWT_SECRET_KEY`，否则每次重启 token 失效

---

## 七、关键依赖说明

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
| PyJWT | JWT token 生成与验证 |

### 前端 npm 依赖

| 包名 | 用途 |
|------|------|
| react / react-dom | UI 框架 |
| react-router-dom | 路由 |
| antd | UI 组件库 |
| axios | HTTP 请求 |
| @tanstack/react-query | 数据获取 + 缓存 |
| dayjs | 日期处理 |
| vite | 构建工具 |

---

## 八、功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 用户认证 | ✅ | JWT + PBKDF2 密码哈希，支持多角色 |
| 子账号管理 | ✅ | 管理员创建/删除子账号，子账号不可再创建 |
| 添加文章（URL 抓取） | ✅ | 支持 Jina → Trafilatura → 直接抓取三级降级 |
| AI 摘要 + 自动标签 | ✅ | 火山方舟 API（需配置 API key） |
| 文章列表 | ✅ | 分页、状态筛选、标签筛选、排序 |
| 全文搜索 | ✅ | FTS5 + jieba 分词，标题/摘要/正文/标签加权 |
| 文章详情 | ✅ | 阅读状态切换、收藏、高亮标注 |
| 标签管理 | ✅ | 重命名、改色、合并、删除 |
| 异常处理 | ✅ | 无效 URL、抓取失败、AI 超时、反爬提示 |
| 性能 | ✅ | 列表 < 5ms，搜索 < 5ms，详情 < 4ms |

---

## 九、注意事项

1. **数据库备份**：SQLite 为单文件，定期备份 `reading_brain.db` 即可
2. **反爬限制**：百度百科、微信公众号等有反爬机制的网站无法自动抓取，需手动粘贴内容
3. **FTS5 索引**：使用 jieba 预分词 + 独立虚拟表，首次启动或 schema 变更时自动重建索引
4. **生产环境安全**：务必设置固定的 `JWT_SECRET_KEY`，配置 HTTPS，修改默认密码
5. **AI API 费用**：火山方舟按 token 计费，请留意用量
6. **SPA 路由**：生产环境所有非 `/api/` 请求回退到 `index.html`，由前端路由处理
