# 认知处理系统 · 独立部署文档

> 本文档说明如何将此项目从 Manus 平台迁移到自己的服务器或第三方云平台独立运行。

---

## 目录

1. [技术栈概览](#1-技术栈概览)
2. [前置准备](#2-前置准备)
3. [方案一：Railway 一键部署（推荐新手）](#3-方案一railway-一键部署推荐新手)
4. [方案二：Render 部署](#4-方案二render-部署)
5. [方案三：自己的 VPS 服务器](#5-方案三自己的-vps-服务器)
6. [数据库迁移](#6-数据库迁移)
7. [文件存储迁移（S3）](#7-文件存储迁移s3)
8. [环境变量配置说明](#8-环境变量配置说明)
9. [常见问题](#9-常见问题)

---

## 1. 技术栈概览

```
前端：React 18 + TypeScript + Vite + Tailwind CSS v4
后端：Node.js + Express + TypeScript
API层：tRPC（前后端类型安全通信）
数据库：MySQL 8.0+
文件存储：S3 兼容对象存储（图片存储）
AI服务：OpenAI API（gpt-4o + o3 + Whisper）
```

项目构建后是一个 **单一 Node.js 进程**，同时提供前端静态文件服务和后端 API，部署非常简单。

---

## 2. 前置准备

在开始部署之前，你需要准备以下账号和密钥：

### 必须准备

| 服务 | 用途 | 获取地址 |
|---|---|---|
| **OpenAI API Key** | AI 分析、语音识别 | https://platform.openai.com/api-keys |
| **MySQL 数据库** | 存储所有数据 | 见下方各方案说明 |
| **S3 兼容存储** | 存储上传的图片 | 见下方说明 |

### 可选准备

| 服务 | 用途 | 说明 |
|---|---|---|
| **GitHub Token** | 知识入库推送 | 在系统设置页配置，不影响基本功能 |
| **自定义域名** | 绑定自己的域名 | 可选 |

---

## 3. 方案一：Railway 一键部署（推荐新手）

Railway 是最简单的部署方式，自带 MySQL 数据库，费用约 $5/月起。

### 步骤 1：注册 Railway

访问 https://railway.app 注册账号（可用 GitHub 登录）。

### 步骤 2：创建项目

1. 点击 **New Project**
2. 选择 **Deploy from GitHub repo**
3. 授权 Railway 访问你的 GitHub，选择 `wangzhanku` 仓库
4. Railway 会自动检测到 Node.js 项目

### 步骤 3：添加 MySQL 数据库

1. 在项目页面点击 **+ New**
2. 选择 **Database → MySQL**
3. Railway 会自动创建 MySQL 实例并注入 `DATABASE_URL` 环境变量

### 步骤 4：配置环境变量

在 Railway 项目的 **Variables** 标签页，添加以下环境变量：

```env
# 必填
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
JWT_SECRET=your-random-secret-string-at-least-32-chars

# S3 存储（见第7节）
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
S3_ENDPOINT=https://s3.amazonaws.com  # 或其他 S3 兼容服务地址

# OAuth（如果不需要登录功能，可以跳过）
# VITE_APP_ID=your-oauth-app-id
# OAUTH_SERVER_URL=https://api.manus.im
# VITE_OAUTH_PORTAL_URL=https://manus.im
```

> **JWT_SECRET** 可以用以下命令生成随机字符串：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 步骤 5：修改构建命令

在 Railway 项目设置中，确认：
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`

### 步骤 6：初始化数据库

部署成功后，需要创建数据库表。在 Railway 的 MySQL 控制台执行以下 SQL：

```sql
-- 见本文档末尾的「数据库建表 SQL」章节
```

### 步骤 7：访问网站

Railway 会自动分配一个域名，格式为 `xxx.railway.app`，部署完成后即可访问。

---

## 4. 方案二：Render 部署

Render 有免费套餐（但有冷启动延迟），适合个人使用。

### 步骤 1：注册 Render

访问 https://render.com 注册账号。

### 步骤 2：创建 Web Service

1. 点击 **New → Web Service**
2. 连接 GitHub，选择 `wangzhanku` 仓库
3. 配置：
   - **Runtime**: Node
   - **Build Command**: `pnpm install && pnpm build`
   - **Start Command**: `pnpm start`
   - **Instance Type**: Free（免费）或 Starter（$7/月，无冷启动）

### 步骤 3：创建 MySQL 数据库

Render 原生支持 PostgreSQL，MySQL 需要用外部服务：
- 推荐使用 **PlanetScale**（免费 MySQL，https://planetscale.com）
- 或 **Aiven**（免费 MySQL，https://aiven.io）

### 步骤 4：配置环境变量

在 Render 的 **Environment** 标签页添加与方案一相同的环境变量。

### 步骤 5：部署

点击 **Create Web Service**，Render 会自动构建并部署。

---

## 5. 方案三：自己的 VPS 服务器

适合有一定技术基础的用户，完全自主控制，成本最低（约 ¥30-100/月）。

### 推荐服务器配置

- **CPU**: 1核以上
- **内存**: 1GB 以上（推荐 2GB）
- **系统**: Ubuntu 22.04 LTS
- **推荐服务商**: 阿里云、腾讯云、Vultr、DigitalOcean

### 步骤 1：安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
npm install -g pnpm

# 安装 MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation

# 安装 PM2（进程守护）
npm install -g pm2

# 安装 Nginx（反向代理）
sudo apt install -y nginx
```

### 步骤 2：克隆代码

```bash
cd /var/www
git clone https://github.com/8876841-bit/wangzhanku.git second-brain
cd second-brain
pnpm install
```

### 步骤 3：配置环境变量

```bash
cp .env.example .env  # 如果有的话
nano .env
```

创建 `.env` 文件，填入以下内容：

```env
NODE_ENV=production
DATABASE_URL=mysql://root:your_password@localhost:3306/second_brain
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
JWT_SECRET=your-random-secret-string
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
S3_ENDPOINT=https://s3.amazonaws.com
PORT=3000
```

### 步骤 4：创建数据库

```bash
# 登录 MySQL
sudo mysql -u root -p

# 创建数据库
CREATE DATABASE second_brain CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'secondbrain'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON second_brain.* TO 'secondbrain'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

然后执行建表 SQL（见本文档末尾）。

### 步骤 5：构建项目

```bash
cd /var/www/second-brain
pnpm build
```

### 步骤 6：用 PM2 启动服务

```bash
# 启动
pm2 start pnpm --name "second-brain" -- start

# 设置开机自启
pm2 startup
pm2 save
```

### 步骤 7：配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/second-brain
```

填入以下内容（替换 `your-domain.com` 为你的域名或服务器 IP）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 180s;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/second-brain /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 步骤 8：配置 HTTPS（可选但推荐）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 6. 数据库迁移

如果你在 Manus 上已经有数据，需要先导出再导入。

### 导出数据（在 Manus 上操作）

在 Manus 的 Database 面板，使用导出功能，或联系 Manus 支持获取数据导出。

### 建表 SQL

在新数据库中执行以下 SQL 创建所有表：

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `openId` varchar(64) NOT NULL UNIQUE,
  `name` text,
  `email` varchar(320),
  `loginMethod` varchar(64),
  `role` enum('user', 'admin') NOT NULL DEFAULT 'user',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `users_id` PRIMARY KEY(`id`)
);

-- 认知条目表
CREATE TABLE IF NOT EXISTS `entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `rawText` text,
  `imageUrl` text,
  `category` enum('Concept','Person','Case','Question','Insight','Idea','Skill','Action','Model','Trigger','Positioning') NOT NULL DEFAULT 'Idea',
  `title` varchar(255),
  `summary` text,
  `tags` json,
  `aiAnswer` text,
  `researchSuggestions` json,
  `noteItemsJson` text,
  `coreTheme` varchar(500),
  `connectionInsight` text,
  `status` enum('processing','pending_review','confirmed','archived','needs_deepdive','duplicate','upgradeable','model','parked','discarded') NOT NULL DEFAULT 'processing',
  `needsDeepDive` tinyint(1) NOT NULL DEFAULT 0,
  `isDuplicate` tinyint(1) NOT NULL DEFAULT 0,
  `duplicateOfId` int DEFAULT NULL,
  `similarityScore` float DEFAULT NULL,
  `userCorrection` text,
  `correctedCategory` enum('Concept','Person','Case','Question','Insight','Idea','Skill','Action','Model','Trigger','Positioning') DEFAULT NULL,
  `correctedTitle` varchar(255) DEFAULT NULL,
  `githubSynced` tinyint(1) NOT NULL DEFAULT 0,
  `githubPath` text,
  `clusterId` int DEFAULT NULL,
  `nextActionType` varchar(64) DEFAULT NULL,
  `nextAction` text DEFAULT NULL,
  `aiInterpretation` text DEFAULT NULL,
  `finalInterpretation` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `entries_id` PRIMARY KEY(`id`)
);

-- 知识簇表（用于模型升级）
CREATE TABLE IF NOT EXISTS `entry_clusters` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('Concept','Person','Case','Question','Insight','Idea','Skill','Action','Model','Trigger','Positioning') NOT NULL DEFAULT 'Model',
  `description` text,
  `modelContent` text,
  `entryCount` int NOT NULL DEFAULT 0,
  `status` enum('accumulating','upgradeable','upgraded') NOT NULL DEFAULT 'accumulating',
  `githubPath` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `entry_clusters_id` PRIMARY KEY(`id`)
);

-- GitHub 配置表
CREATE TABLE IF NOT EXISTS `github_configs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL UNIQUE,
  `githubToken` text,
  `repoOwner` varchar(128),
  `repoName` varchar(128),
  `branch` varchar(128) DEFAULT 'main',
  `lastSyncAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `github_configs_id` PRIMARY KEY(`id`)
);
```

---

## 7. 文件存储迁移（S3）

项目使用 S3 兼容存储来保存上传的图片。

### 选项 A：AWS S3（官方，最稳定）

1. 注册 AWS 账号：https://aws.amazon.com
2. 创建 S3 Bucket，记录 Bucket 名称和所在区域
3. 创建 IAM 用户，赋予 S3 读写权限，获取 Access Key 和 Secret Key
4. 在环境变量中填入：
   ```env
   AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
   AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   AWS_REGION=ap-northeast-1
   AWS_BUCKET_NAME=your-bucket-name
   S3_ENDPOINT=https://s3.ap-northeast-1.amazonaws.com
   ```

### 选项 B：Cloudflare R2（便宜，有免费额度）

1. 注册 Cloudflare 账号：https://cloudflare.com
2. 进入 R2 → 创建 Bucket
3. 创建 API Token（R2 读写权限）
4. 在环境变量中填入：
   ```env
   AWS_ACCESS_KEY_ID=your-r2-access-key
   AWS_SECRET_ACCESS_KEY=your-r2-secret-key
   AWS_REGION=auto
   AWS_BUCKET_NAME=your-bucket-name
   S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
   ```

### 选项 C：阿里云 OSS（国内访问快）

1. 注册阿里云账号：https://aliyun.com
2. 开通 OSS，创建 Bucket（选择公共读或私有）
3. 创建 AccessKey
4. 在环境变量中填入：
   ```env
   AWS_ACCESS_KEY_ID=your-aliyun-access-key
   AWS_SECRET_ACCESS_KEY=your-aliyun-secret-key
   AWS_REGION=oss-cn-hangzhou
   AWS_BUCKET_NAME=your-bucket-name
   S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
   ```

---

## 8. 环境变量配置说明

| 变量名 | 必填 | 说明 |
|---|---|---|
| `NODE_ENV` | 是 | 生产环境填 `production` |
| `DATABASE_URL` | 是 | MySQL 连接字符串，格式：`mysql://user:pass@host:3306/dbname` |
| `OPENAI_API_KEY` | 是 | OpenAI API Key，用于 AI 分析和语音识别 |
| `JWT_SECRET` | 是 | 会话签名密钥，随机字符串，至少 32 位 |
| `AWS_ACCESS_KEY_ID` | 是 | S3 存储 Access Key |
| `AWS_SECRET_ACCESS_KEY` | 是 | S3 存储 Secret Key |
| `AWS_REGION` | 是 | S3 存储区域 |
| `AWS_BUCKET_NAME` | 是 | S3 Bucket 名称 |
| `S3_ENDPOINT` | 是 | S3 服务地址 |
| `PORT` | 否 | 服务端口，默认 3000 |
| `VITE_APP_ID` | 否 | Manus OAuth App ID（如果不用 Manus 登录可不填） |

### 关于登录功能

本项目默认使用 Manus OAuth 登录。如果你迁移到独立服务器，有两个选择：

**选项 A：继续使用 Manus OAuth**
- 保留 `VITE_APP_ID`、`OAUTH_SERVER_URL`、`VITE_OAUTH_PORTAL_URL` 环境变量
- 在 Manus 开发者后台将你的新域名添加到回调地址白名单

**选项 B：改用其他登录方式**
- 需要修改 `server/_core/oauth.ts` 和前端登录逻辑
- 可以接入 Google OAuth、GitHub OAuth 或自建用户名密码登录
- 这需要一定的开发工作量

---

## 9. 常见问题

### Q：部署后页面空白或报错？
检查以下几点：
1. 确认 `pnpm build` 构建成功，没有报错
2. 确认所有必填环境变量都已配置
3. 查看服务器日志：`pm2 logs second-brain`

### Q：图片上传失败？
1. 检查 S3 相关环境变量是否正确
2. 确认 S3 Bucket 的 CORS 配置允许你的域名
3. 确认 IAM 用户有 `s3:PutObject` 和 `s3:GetObject` 权限

### Q：AI 分析失败？
1. 检查 `OPENAI_API_KEY` 是否有效
2. 确认 OpenAI 账号有足够余额
3. 注意：o3 模型需要 OpenAI Tier 3+ 账号才能使用，如果报错可以在 `server/aiService.ts` 中将 `o3` 改为 `gpt-4o`

### Q：数据库连接失败？
1. 检查 `DATABASE_URL` 格式是否正确
2. 确认 MySQL 服务正在运行
3. 确认数据库用户有足够权限
4. 如果使用云数据库，检查防火墙/安全组是否开放 3306 端口

### Q：如何更新代码？

```bash
# 在服务器上
cd /var/www/second-brain
git pull origin main
pnpm install
pnpm build
pm2 restart second-brain
```

---

## 附录：项目目录结构

```
second-brain/
├── client/                 # 前端代码（React）
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── components/     # 通用组件
│   │   ├── lib/            # 工具函数
│   │   └── App.tsx         # 路由配置
├── server/                 # 后端代码（Node.js）
│   ├── aiService.ts        # AI 分析服务
│   ├── entriesRouter.ts    # 核心 API 路由
│   ├── githubService.ts    # GitHub 同步服务
│   └── _core/             # 框架核心（OAuth、数据库等）
├── drizzle/               # 数据库 Schema
├── shared/                # 前后端共享类型
├── DEPLOY.md              # 本部署文档
└── package.json
```

---

*文档版本：2026-05-24 · 认知处理系统 v2*
