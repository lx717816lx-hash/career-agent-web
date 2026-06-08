# 🎯 大学生求职智能体网页系统

AI 驱动的大学生求职助手，帮助大学生、应届生、实习生完成求职全流程。

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 🔍 求职诊断 | 根据学历、学校、经历等全面分析求职竞争力 |
| 📄 简历优化 | 资深HR帮你根据岗位JD修改简历，使用STAR法则 |
| 🎯 岗位推荐 | 分为冲刺/主投/保底三层匹配推荐 |
| 📋 投递计划 | 制定14天科学投递计划 |
| 💼 模拟面试 | 互联网资深HR一对一模拟面试，自动评分 |

## 🛠️ 技术栈

- **前端**：React + Vite
- **后端**：Node.js + Express
- **AI**：OpenAI 兼容接口（国内大模型）
- **简历解析**：pdf-parse + mammoth

## 🚀 快速开始（零基础用户）

### 第1步：安装 Node.js

如果你还没有 Node.js，请先下载安装：

1. 访问 https://nodejs.org/
2. 下载 **LTS（长期支持版）**
3. 双击安装，一路点"下一步"即可

### 第2步：下载项目

如果你已经下载了本项目代码，跳过此步。

```bash
git clone <你的仓库地址>
cd career-agent-web
```

### 第3步：安装依赖

```bash
npm install
```

### 第4步：配置 AI 模型

复制环境变量模板：

```bash
# Windows
copy .env.example .env

# Mac/Linux
cp .env.example .env
```

然后用记事本或任何编辑器打开 `.env` 文件，填入你的 API Key。

#### 通义千问 / 阿里云百炼（推荐新手使用）

```env
AI_PROVIDER=qwen
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
AI_API_KEY=你的通义千问APIKey
```

获取 API Key：
1. 访问 https://dashscope.console.aliyun.com/
2. 注册/登录阿里云账号
3. 开通 DashScope 服务
4. 在 API-KEY 管理页面创建新的 API Key

#### 豆包 / 火山方舟

```env
AI_PROVIDER=doubao
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_MODEL=你的火山方舟推理接入点ID
AI_API_KEY=你的火山方舟APIKey
```

获取 API Key：
1. 访问 https://www.volcengine.com/product/ark
2. 注册/登录火山引擎账号
3. 创建推理接入点，获取接入点 ID
4. 在 API Key 管理页面创建 API Key

### 第5步：启动开发服务器

需要同时启动前端和后端：

**方式一：两个终端窗口**

终端1（后端）：
```bash
node server.js
```

终端2（前端开发）：
```bash
npm run dev
```

**方式二：一条命令**

```bash
npx concurrently "node server.js" "npm run dev"
```

### 第6步：打开网页

- 开发模式：访问 http://localhost:5173
- 生产模式：访问 http://localhost:3000

## 📦 生产部署

构建前端：
```bash
npm run build
```

启动生产服务（自动服务前端+后端）：
```bash
npm start
```

访问 http://localhost:3000

## ⚠️ 安全须知

- **不要**把 `.env` 文件上传到 Git
- **不要**在前端代码中写 API Key
- 上传的简历仅用于本次分析，不会永久保存
- 请勿上传包含身份证号、银行卡号等敏感信息的文件
- AI 不会帮助编造经历、证书或奖项

## 📁 项目结构

```
career-agent-web
├── package.json          # 项目依赖配置
├── server.js             # Express 后端服务
├── .env.example          # 环境变量模板
├── .gitignore            # Git 忽略文件
├── README.md             # 项目说明
├── DEPLOY.md             # 部署指南
├── index.html            # HTML 入口
├── vite.config.js        # Vite 配置
├── src
│   ├── main.jsx          # React 入口
│   ├── App.jsx           # 主应用组件
│   ├── api.js            # 前端API调用
│   └── styles.css        # 样式
└── public                # 静态资源
```

## 常见问题

**Q: npm install 报错怎么办？**
A: 尝试使用淘宝镜像：`npm config set registry https://registry.npmmirror.com/`，然后重新 `npm install`

**Q: 启动后页面空白？**
A: 确保同时启动了后端（`node server.js`）和前端（`npm run dev`）

**Q: AI 分析报错？**
A: 检查 `.env` 文件中的 AI_API_KEY 是否正确填写

**Q: 简历上传失败？**
A: 确认文件格式为 PDF/DOCX/TXT，大小不超过 5MB

## License

MIT
