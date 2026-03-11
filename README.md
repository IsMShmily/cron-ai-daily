# Crontab 定时任务管理

Mac 本地的 Crontab 定时任务管理工具：在项目中用配置文件定义任务，通过 Web 界面增删改查，一键同步到系统 crontab。仅修改 crontab 中带标记的区块，不影响你已有的其他定时任务。

## 功能

- **任务配置**：在项目根目录的 `cron-jobs.yaml` 中定义任务（也可在界面中操作）
- **增删改查**：Web 界面管理任务列表，支持启用/禁用、编辑、删除
- **同步到 Crontab**：点击「同步到 Crontab」将当前配置写入本机 crontab（仅替换 `# CRONTAB-MANAGER-START` / `# CRONTAB-MANAGER-END` 之间的内容）
- **立即执行**：每个任务提供「立即执行」按钮，可立即运行一次脚本并查看标准输出/标准错误，便于测试
 - **示例任务**：内置「每日 Git 提交汇总」脚本，可指定 Git 目录，每天定时拉取各分支当日 commit 并写入 `logs/` 目录
 - **Webhook + 本地 Ollama 整理日报**：任务执行完成后可将结果（含 AI 整理后的工程日报）通过 Webhook 自动推送到飞书等 IM 机器人，仅依赖本机运行的 LLM 服务，不会上传到第三方云端

![alt text](/docs-image/image.png)

![alt text](/docs-image/image1.png)

![alt text](/docs-image/image2.png)

![alt text](/docs-image/image3.png)

![alt text](/docs-image/image4.png)


## 安装与运行

### 1. 安装依赖

```bash
cd /path/to/crontab
pnpm install
cd web && pnpm install
```

### 2. 启动后端

```bash
# 在项目根目录
pnpm start
```

服务监听 `http://127.0.0.1:3846`（可通过环境变量 `PORT` 修改）。

### 3. 启动前端（开发）

```bash
cd web
pnpm run dev
```

浏览器打开 Vite 提供的地址（如 `http://localhost:5173`），前端会通过代理访问后端 API。

### 4. 生产方式（可选）

构建前端后由后端托管静态文件：

```bash
cd web && pnpm run build
cd .. && pnpm start
```

然后访问 `http://127.0.0.1:3846` 即可使用完整功能。

## 配置说明

### cron-jobs.yaml 格式

```yaml
jobs:
  - id: git-daily-commits      # 唯一 ID
    name: 每日 Git 提交汇总     # 显示名称
    schedule: "30 18 * * *"     # 5 段 cron 表达式（每天 18:30）
    script: git-daily-commits.js
    args:
      repoPath: "/path/to/your/git/repo"
    enabled: true
```

- **schedule**：标准 5 段 cron（分 时 日 月 周）
- **script**：项目内 `scripts/` 目录下的脚本文件名（如 `.js` 由 Node 执行）
- **args**：传给脚本的参数，如 `repoPath` 会作为命令行参数传入
- **webhook**（选填）：任务执行完成后，将结果以 JSON POST 到该 URL，请求体包含 `jobId`、`name`、`ok`、`stdout`、`stderr`、`code`、`timestamp`

### 示例：每日 18:30 获取某 Git 目录各分支当日 commit

1. 在界面中编辑「每日 Git 提交汇总」任务，将 `args.repoPath` 改为你的仓库绝对路径；或直接编辑 `cron-jobs.yaml` 中的 `repoPath`。
2. 点击「同步到 Crontab」。
3. 到点后脚本会执行，结果写入项目下 `logs/git-daily-commits-YYYY-MM-DD.log`。

### AI 日报整理（可选）

本项目内置 `scripts/git-daily-commits.js` + 本地 LLM（如 Ollama），可以在生成原始 Git 提交日志后，自动调用大模型对日志进行整理，总结为结构化「工程日报」，并：

- 写入 `logs/git-daily-commits-YYYY-MM-DD.summary.log`
- 若配置了飞书机器人 webhook，则以互动卡片形式自动推送到飞书群。

#### 1. 配置本地 LLM 环境变量

在项目根目录创建或编辑 `.env`（已内置示例）：

```bash
OLLAMA_BASE_URL="http://localhost:11434/v1"
LLM_PROVIDER="ollama"
LLM_MODEL="qwen2.5:7b"
PROMET_SYSTEM="你是一个资深工程团队负责人……（自定义系统提示词）"
```

要求：

- 本地已启动 Ollama 或兼容 OpenAI 接口的 LLM 服务
- `OLLAMA_BASE_URL` 指向对应的 chat 接口（支持 `/api/chat` 或 `/v1/chat/completions` 风格）

`git-daily-commits.js` 会在生成原始日志后：

- 读取 `.env` 中的系统提示词和模型
- 将原始日志作为上下文发给 LLM
- 将整理后的日报写入 `logs` 目录，并在 stdout 中打印一段带标记的 AI 日报。

#### 2. 配置飞书机器人 webhook（可选）

在任务中配置 `webhook` 为飞书自定义机器人地址（形如：

```text
https://open.larksuite.com/open-apis/bot/v2/hook/****
```

）后：

- 定时任务通过 `scripts/run-with-webhook.js` 执行脚本
- 执行结束后从 stdout 中提取 AI 日报内容
- 以 **互动卡片（interactive card）** 的形式推送到飞书，结构类似：

```json
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "工程日报 · 每日 Git 提交汇总" }
    },
    "elements": [
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "这里是 AI 整理后的日报内容……"
        }
      }
    ]
  }
}
```

前端点击「立即执行」按钮时，如果该任务配置了飞书 webhook，也会触发同样的推送流程，可用于测试。

## 项目结构

```
crontab/
├── package.json
├── cron-jobs.yaml        # 任务配置
├── server/               # Node 后端（Koa）
│   ├── index.js
│   ├── config.js         # 读写 YAML
│   ├── crontab.js        # 解析/生成/同步 crontab
│   └── routes/jobs.js
├── scripts/             # 可被定时调用的脚本
│   └── git-daily-commits.js
├── web/                  # React 前端
└── README.md
```

## API

- `GET /api/jobs`：任务列表（含下次运行时间）
- `POST /api/jobs`：新增任务
- `PUT /api/jobs/:id`：更新任务
- `DELETE /api/jobs/:id`：删除任务
- `POST /api/jobs/:id/run`：立即执行该任务一次（返回 stdout/stderr）
- `POST /api/sync`：同步到系统 crontab
- `GET /api/crontab/raw`：当前 crontab 原始内容（调试）
- `GET /api/scripts`：可选脚本列表

## 注意事项

- 仅操作**当前用户**的 crontab（`crontab -l` / `crontab -`）。
- 服务仅监听 127.0.0.1，仅本机访问。
- 新增或修改任务后，需点击「同步到 Crontab」才会真正写入系统 crontab。

## 开源协议

本项目采用 **MIT License** 开源协议，任何人可以在遵守 MIT 许可证条款的前提下自由使用、复制、修改和分发本项目代码（包括商业用途）。  
