# 🚀 部署指南

本文档介绍如何将求职智能体部署到公网。

## 一、本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 复制模板
copy .env.example .env   # Windows
cp .env.example .env      # Mac/Linux
```

编辑 `.env` 填入你的 AI API Key。

### 3. 启动开发

```bash
# 终端1：启动后端
node server.js

# 终端2：启动前端开发服务器
npm run dev
```

访问 http://localhost:5173

### 4. 生产模式

```bash
npm run build
npm start
```

访问 http://localhost:3000

---

## 二、配置通义千问

通义千问是阿里云的大模型服务，推荐新手使用。

1. 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/)
2. 注册/登录阿里云账号
3. 开通 DashScope 服务（新用户有免费额度）
4. 在 API-KEY 管理页面创建 API Key

`.env` 配置：
```env
AI_PROVIDER=qwen
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
AI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

可选模型：`qwen-turbo`（便宜）、`qwen-plus`（推荐）、`qwen-max`（最强）

---

## 三、配置豆包 / 火山方舟

1. 访问 [火山方舟控制台](https://console.volcengine.com/ark)
2. 注册/登录火山引擎账号
3. 创建推理接入点（选择豆包模型）
4. 获取接入点 ID（格式如 `ep-xxxxxxxxxxxx`）
5. 在 API Key 管理页面创建 API Key

`.env` 配置：
```env
AI_PROVIDER=doubao
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_MODEL=ep-xxxxxxxxxxxx
AI_API_KEY=xxxxxxxxxxxxxxxx
```

---

## 四、部署到 Render

### 方法一：通过 Render Dashboard

1. 将代码推送到 GitHub 仓库
2. 访问 [Render](https://render.com/) 并注册
3. 点击 "New" → "Web Service"
4. 连接你的 GitHub 仓库
5. 配置：
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
6. 添加环境变量：
   - `AI_PROVIDER` = `qwen`
   - `AI_BASE_URL` = `https://dashscope.aliyuncs.com/compatible-mode/v1`
   - `AI_MODEL` = `qwen-plus`
   - `AI_API_KEY` = `你的APIKey`
   - `PORT` = `3000`（Render 会自动分配端口，也可不设）
7. 点击 "Create Web Service"
8. 等待部署完成，获得公网链接（如 `https://your-app.onrender.com`）

### 方法二：使用 render.yaml

在项目根目录创建 `render.yaml`：

```yaml
services:
  - type: web
    name: career-agent-web
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: AI_PROVIDER
        value: qwen
      - key: AI_BASE_URL
        value: https://dashscope.aliyuncs.com/compatible-mode/v1
      - key: AI_MODEL
        value: qwen-plus
      - key: AI_API_KEY
        sync: false  # 需要手动填写
```

---

## 五、部署到 Railway

1. 访问 [Railway](https://railway.app/) 并注册
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的仓库
4. 配置环境变量：
   - 在 "Variables" 标签页添加 `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`
5. Railway 会自动检测 Node.js 项目并部署
6. 在 "Settings" → "Networking" 中生成公网域名

Railway 会自动运行 `npm run build` 和 `npm start`。

---

## 六、部署到腾讯云 CloudBase

1. 访问 [腾讯云 CloudBase](https://cloud.tencent.com/product/tcb)
2. 注册/登录腾讯云账号
3. 创建云开发环境
4. 使用 CloudBase CLI 部署：

```bash
# 安装 CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 初始化
tcb init

# 部署
tcb framework deploy
```

5. 或者在 CloudBase 控制台上传代码：
   - 先在本地运行 `npm run build`
   - 将 `dist` 目录下的文件上传到静态网站托管
   - 将 `server.js` 部署为云函数

6. 在环境变量中配置 AI 相关参数

---

## 七、环境变量配置说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `AI_PROVIDER` | AI 提供商标识 | `qwen` 或 `doubao` |
| `AI_BASE_URL` | OpenAI 兼容接口地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `AI_MODEL` | 模型名称 | `qwen-plus` |
| `AI_API_KEY` | API 密钥 | `sk-xxxxxxxx` |
| `PORT` | 服务端口 | `3000` |

**注意**：
- `AI_API_KEY` 是敏感信息，不要提交到 Git
- 在部署平台上通过环境变量配置界面设置
- PORT 在 Render/Railway 上会自动分配，不需要手动设置

---

## 八、如何获得公网链接

### Render
部署成功后，在服务详情页面的顶部会显示公网链接，格式如：`https://your-app-name.onrender.com`

### Railway
在项目设置 → Networking 中点击生成域名，格式如：`your-app.up.railway.app`

### 腾讯云 CloudBase
部署成功后，在云开发控制台的静态网站托管页面可以看到默认域名，也可以绑定自定义域名。

### 自定义域名
所有平台都支持绑定自定义域名，具体步骤请参考各平台文档。

---

## 常见部署问题

**Q: 部署后 API 调用失败？**
A: 检查环境变量中的 AI_API_KEY 是否正确配置

**Q: 前端页面空白？**
A: 确保构建命令 `npm run build` 执行成功，dist 目录存在

**Q: 端口绑定失败？**
A: 大多数云平台会自动设置 PORT 环境变量，代码中使用 `process.env.PORT || 3000` 即可

**Q: 冷启动慢？**
A: Render 免费版有冷启动延迟（约30秒），可以考虑升级或使用 Railway
