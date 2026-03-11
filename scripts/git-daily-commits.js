#!/usr/bin/env node
/**
 * 查询指定 Git 目录下所有分支在指定时间范围内的 commit，可选显示相对 main/master 的 diff 统计
 * 用法: node git-daily-commits.js <repoPath> [today|yesterday]
 *       node git-daily-commits.js <repoPath> [选项]
 *
 * 选项:
 *   --since=YYYY-MM-DD  起始日期（默认：今天 00:00；传 yesterday 等价于昨日）
 *   --limit=N           每个分支最多显示 N 条（默认 50）
 *   --stat              显示相对 main/master 的 diff 统计
 *   --local             仅本地分支（默认：本地+远程所有分支）
 *   -h, --help          显示此帮助
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chatWithOllama } = require('./llmClient');

// 加载项目根目录下的 .env（如 OLLAMA_BASE_URL 等）
try {
  // __dirname: scripts/，上一级是项目根
  const envPath = path.resolve(__dirname, '..', '.env');
  require('dotenv').config({ path: envPath, quiet: true });
} catch (e) {
  // dotenv 缺失或加载失败时忽略，不影响原有功能
}

const argv = process.argv.slice(2);
let repoPath = null;
let sinceOpt = null;
let limit = 50;
let showStat = false;
let localOnly = false;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    console.log(`用法: ${path.basename(process.argv[1])} <repoPath> [today|yesterday] [选项]
  默认：所有分支（本地+远程），今天以来的提交
  --since=YYYY-MM-DD  指定起始日期（默认：今天）
  --limit=N           每个分支最多显示 N 条（默认 50）
  --stat              显示相对 main/master 的 diff 统计
  --local             仅本地分支（默认含远程）
  -h, --help          显示此帮助`);
    process.exit(0);
  }
  if (arg.startsWith('--since=')) {
    sinceOpt = arg.slice(8).trim();
  } else if (arg.startsWith('--limit=')) {
    limit = parseInt(arg.slice(8), 10) || 50;
  } else if (arg === '--stat') {
    showStat = true;
  } else if (arg === '--local') {
    localOnly = true;
  } else if (arg === 'today' || arg === 'yesterday') {
    sinceOpt = arg;
  } else if (!repoPath && !arg.startsWith('-')) {
    repoPath = arg;
  }
}

if (!repoPath) {
  console.error('用法: node git-daily-commits.js <repoPath> [today|yesterday] [--since=YYYY-MM-DD] [--limit=N] [--stat] [--local]');
  process.exit(1);
}

const absRepo = path.resolve(repoPath);
if (!fs.existsSync(absRepo)) {
  console.error('错误: 目录不存在', absRepo);
  process.exit(1);
}

const gitDir = path.join(absRepo, '.git');
if (!fs.existsSync(gitDir)) {
  console.error('错误: 不是 Git 仓库', absRepo);
  process.exit(1);
}

const opts = { cwd: absRepo, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 };

function run(cmd) {
  try {
    return execSync(cmd, opts).trim();
  } catch (e) {
    return null;
  }
}

// 解析时间范围
let sinceStr;
let untilStr;
let reportDate;
let titleSuffix;

if (sinceOpt === 'yesterday' || (sinceOpt && sinceOpt.toLowerCase() === 'yesterday')) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  sinceStr = `${y}-${m}-${day} 00:00:00`;
  untilStr = `${y}-${m}-${day} 23:59:59`;
  reportDate = `${y}-${m}-${day}`;
  titleSuffix = '昨日';
} else if (sinceOpt && /^\d{4}-\d{2}-\d{2}$/.test(sinceOpt)) {
  sinceStr = `${sinceOpt} 00:00:00`;
  untilStr = null;
  reportDate = sinceOpt;
  titleSuffix = sinceOpt;
} else {
  sinceStr = 'midnight';
  untilStr = null;
  reportDate = new Date().toISOString().slice(0, 10);
  titleSuffix = '今日';
}

// 基准分支（用于 --stat）：存在则 show-ref 退出 0，run 不抛则返回空串
let baseBranch = 'HEAD';
try {
  execSync('git show-ref -q refs/heads/main', opts);
  baseBranch = 'main';
} catch {
  try {
    execSync('git show-ref -q refs/heads/master', opts);
    baseBranch = 'master';
  } catch {
    baseBranch = 'HEAD';
  }
}

// 分支列表：默认所有分支（本地+远程），--local 则仅本地
const branchCmd = localOnly
  ? 'git branch --no-color'
  : 'git branch -a --format="%(refname:short)"';
let branches = [];

if (localOnly) {
  const out = run(branchCmd);
  if (out) {
    branches = out
      .split('\n')
      .map((line) => line.replace(/^\*?\s*/, '').trim())
      .filter(Boolean);
  }
} else {
  const out = run(branchCmd);
  if (out) {
    const raw = out
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b && !b.startsWith('origin/HEAD'));
    // 去重：同一分支既有 dev 又有 origin/dev 时只保留一个，优先用本地分支
    const byName = new Map(); // displayName -> ref
    for (const ref of raw) {
      const name = ref.replace(/^origin\//, '');
      if (!byName.has(name) || !ref.startsWith('origin/')) {
        byName.set(name, ref);
      }
    }
    branches = [...byName.values()];
  }
}

const logFormat = '%h %ad %s';
const dateFormat = 'short';

let output = [];
output.push(`# Git 提交汇总（${titleSuffix}）- ${absRepo}`);
output.push(`# 生成时间: ${new Date().toISOString()}`);
output.push(`# 每个分支最多: ${limit} 条`);
output.push('');
output.push(`========== ${localOnly ? '本地' : '所有'}分支 · ${reportDate} 以来 ==========`);
output.push('');

if (branches.length === 0) {
  output.push('无法获取分支列表');
  const result = output.join('\n');
  writeLog(result, reportDate);
  console.log(result);
  process.exit(0);
}

for (const branch of branches) {
  const branchName = branch.replace(/^origin\//, '');
  // 分支名含括号等时需加引号，否则 shell 会误解析
  const b = branch.replace(/"/g, '\\"');
  const bq = `"${b}"`;

  const countCmd = `git rev-list --count ${bq} --since="${sinceStr}"${untilStr ? ` --until="${untilStr}"` : ''} 2>/dev/null || echo 0`;
  let count = 0;
  try {
    count = parseInt(execSync(countCmd, { ...opts, shell: true }).trim(), 10) || 0;
  } catch {
    count = 0;
  }
  if (count === 0) continue;

  output.push('----------------------------------------');
  output.push(`分支: ${branchName} (${reportDate} 以来 ${count} 条提交)`);
  output.push('----------------------------------------');

  let logCmd = `git log -n ${limit} --pretty=format:"${logFormat}" --date=${dateFormat} ${bq} --since="${sinceStr}"`;
  if (untilStr) logCmd += ` --until="${untilStr}"`;
  const logOut = run(logCmd);
  if (logOut) {
    output.push(logOut);
  }
  output.push('');

  if (showStat && branchName !== baseBranch) {
    const baseQ = baseBranch === 'HEAD' ? 'HEAD' : `"${baseBranch.replace(/"/g, '\\"')}"`;
    const mergeBase = run(`git merge-base ${baseQ} ${bq} 2>/dev/null`);
    if (mergeBase) {
      output.push(`  [相对 ${baseBranch} 的改动统计]`);
      const diffStat = run(`git diff --stat ${baseQ}..${bq} 2>/dev/null`);
      if (diffStat) {
        const lastLine = diffStat.trim().split('\n').pop();
        if (lastLine) output.push(`  ${lastLine}`);
      }
    } else {
      output.push(`  (与 ${baseBranch} 无共同祖先，跳过 diff)`);
    }
    output.push('');
  }
}

output.push('========== 结束 ==========');

const result = output.join('\n');

function writeLog(content, dateStr) {
  const projectRoot = path.resolve(__dirname, '..');
  const logsDir = path.join(projectRoot, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const logFile = path.join(logsDir, `git-daily-commits-${dateStr}.log`);
  fs.writeFileSync(logFile, content, 'utf8');
  return logFile;
}

const logFile = writeLog(result, reportDate);
console.log(result);
console.log('\n# 已写入:', logFile);

// === 使用本地 Ollama / LLM 进行 AI 日报整理（不会影响原有脚本的退出码） ===
;(async () => {
  const systemPrompt =
    (process.env.PROMET_SYSTEM && String(process.env.PROMET_SYSTEM).trim()) ||
    '你是一个资深工程团队负责人。请根据以下 Git 提交日志，生成结构化的中文日报摘要，包含：1）今天完成了哪些工作；2）关键改动和风险；3）后续建议。注意面向团队内部同学。';

  try {
    // 为避免上下文过长，可按需裁剪，这里先直接全量发送
    const userContent = result;
    console.log('\n# 正在调用本地 Ollama 生成 AI 日报整理...');
    const summary = await chatWithOllama({
      system: systemPrompt,
      user: userContent,
    });

    const projectRoot = path.resolve(__dirname, '..');
    const logsDir = path.join(projectRoot, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const summaryFile = path.join(
      logsDir,
      `git-daily-commits-${reportDate}.summary.log`
    );
    fs.writeFileSync(summaryFile, summary, 'utf8');
    console.log('# AI 日报整理已写入:', summaryFile);

    // 同步将 AI 日报内容输出到 stdout，方便 webhook / 飞书机器人直接使用
    console.log('\n========== AI 日报整理（摘要） ==========\n');
    console.log(summary);
  } catch (e) {
    console.log('# AI 日报整理失败（不影响原始日志）:', e && e.message);
  }
})();
