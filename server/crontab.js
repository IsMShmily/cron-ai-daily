/**
 * 解析、生成、同步系统 crontab（仅维护带标记的区块）
 */

const { execSync } = require('child_process');
const path = require('path');
const config = require('./config');

const MARKER_START = '# CRONTAB-MANAGER-START';
const MARKER_END = '# CRONTAB-MANAGER-END';

/**
 * 读取当前用户 crontab 内容（无则返回空字符串）
 */
function readSystemCrontab() {
  try {
    return execSync('crontab -l', { encoding: 'utf8', maxBuffer: 64 * 1024 });
  } catch (e) {
    if (e.status === 1 && (e.stderr || '').toLowerCase().includes('no crontab')) {
      return '';
    }
    throw e;
  }
}

/**
 * 从 crontab 文本中剥离「本管理器」区块，返回 { before, after }
 */
function splitCrontab(content) {
  const lines = (content || '').split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === MARKER_START);
  const endIdx = lines.findIndex((l) => l.trim() === MARKER_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { before: content, after: '', hasBlock: false };
  }

  const before = lines.slice(0, startIdx).join('\n').replace(/\n+$/, '');
  const after = lines.slice(endIdx + 1).join('\n').replace(/^\n+/, '');
  return { before, after, hasBlock: true };
}

/**
 * 根据 cron-jobs.yaml 生成要写入的 crontab 区块（仅 enabled 任务）
 */
function buildManagerBlock() {
  const { jobs } = config.read();
  const scriptsDir = config.getScriptsDir();
  const projectRoot = config.getProjectRoot();
  const nodePath = process.execPath;

  const lines = [MARKER_START, ''];

  const fs = require('fs');
  const wrapperPath = path.join(scriptsDir, 'run-with-webhook.js');
  const hasWrapper = fs.existsSync(wrapperPath);

  for (const job of jobs) {
    if (job.enabled === false) continue;
    const scriptPath = path.join(scriptsDir, job.script);
    if (!fs.existsSync(scriptPath)) continue;

    const ext = path.extname(job.script).toLowerCase();
    let cmd;
    const webhookUrl = job.webhook ? String(job.webhook).trim() : '';

    if (webhookUrl && hasWrapper) {
      const jobId = (job.id || '').replace(/"/g, '\\"');
      const jobName = (job.name || '').replace(/"/g, '\\"');
      cmd = `"${nodePath}" "${wrapperPath}" "${webhookUrl.replace(/"/g, '\\"')}" "${jobId}" "${jobName}" -- "${scriptPath}"`;
    } else if (ext === '.js') {
      cmd = `"${nodePath}" "${scriptPath}"`;
    } else {
      cmd = `"${scriptPath}"`;
    }

    const args = job.args || {};
    if (args.repoPath) {
      cmd += ` "${String(args.repoPath).replace(/"/g, '\\"')}"`;
    }
    if (typeof args.extra === 'string') {
      cmd += ` ${args.extra}`;
    }

    lines.push(`# ${job.id}`);
    lines.push(`${job.schedule} ${cmd}`);
    lines.push('');
  }

  lines.push(MARKER_END);
  return lines.join('\n');
}

/**
 * 将配置同步到系统 crontab（只替换标记区块，保留前后内容）
 */
function syncToSystem() {
  const current = readSystemCrontab();
  const { before, after } = splitCrontab(current);
  const block = buildManagerBlock();

  const parts = [before, block, after].filter(Boolean);
  const newContent = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

  execSync('crontab -', { input: newContent, encoding: 'utf8' });
  return { ok: true, message: '已同步到系统 crontab' };
}

/**
 * 返回当前用户 crontab 原始内容（调试用）
 */
function getRawCrontab() {
  return readSystemCrontab();
}

/**
 * 根据 job 配置构建要执行的完整命令（与 buildManagerBlock 中逻辑一致）
 */
function buildCommandForJob(job) {
  const fs = require('fs');
  const scriptsDir = config.getScriptsDir();
  const nodePath = process.execPath;
  const scriptPath = path.join(scriptsDir, job.script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`脚本不存在: ${job.script}`);
  }
  const ext = path.extname(job.script).toLowerCase();
  let cmd = ext === '.js'
    ? `"${nodePath}" "${scriptPath}"`
    : `"${scriptPath}"`;
  const args = job.args || {};
  if (args.repoPath) {
    cmd += ` "${String(args.repoPath).replace(/"/g, '\\"')}"`;
  }
  if (typeof args.extra === 'string') {
    cmd += ` ${args.extra}`;
  }
  return cmd;
}

/** 若配置了 webhook，向该 URL POST 执行结果（用于「立即执行」） */
function notifyWebhook(webhookUrl, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return Promise.resolve();
  const url = webhookUrl.trim();
  if (!url) return Promise.resolve();
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;
  // 调试：打印 webhook 调用信息
  // 注意：payload 可能较大，这里仅打印部分字段
  try {
    const { jobId, name, ok, code } = payload || {};
    console.log('[webhook] 准备发送', {
      rawUrl: webhookUrl,
      fullUrl,
      jobId,
      name,
      ok,
      code,
    });
  } catch (e) {
    console.log('[webhook] 打印 payload 失败:', e.message);
  }
  const u = new URL(fullUrl);
  const mod = u.protocol === 'https:' ? require('https') : require('http');
  // 飞书机器人 webhook 特殊格式适配：
  //  - URL 形如: https://open.larksuite.com/open-apis/bot/v2/hook/xxxx
  //  - Body 需为: { "msg_type": "text", "content": { "text": "..." } }
  const isLarkBot = /open\.larksuite\.com\/open-apis\/bot\/v2\/hook\//.test(fullUrl);
  let bodyObj = payload;
  if (isLarkBot) {
    const { jobId, name, ok, code, stdout, stderr, timestamp } = payload || {};
    const aiSummary = extractAiSummary(stdout || '');
    const text =
      aiSummary && aiSummary.trim()
        ? aiSummary.trim()
        : '(暂无 AI 日报整理，原始输出略)';
    bodyObj = {
      msg_type: 'text',
      content: {
        text,
      },
    };
  }
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve) => {
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        // 调试：打印响应状态码
        console.log('[webhook] 响应状态', {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
        });
        // 消耗响应体以避免 socket 挂起
        res.resume();
        resolve();
      }
    );
    req.on('error', (err) => {
      // 调试：打印请求错误，但不抛出
      console.log('[webhook] 请求错误', {
        message: err && err.message,
        code: err && err.code,
      });
      resolve();
    });
    req.write(body);
    req.end();
  });
}

/**
 * 从 stdout 中提取 AI 日报整理部分（若存在）
 * 通过标记行 "========== AI 日报整理（摘要） ==========" 分割
 */
function extractAiSummary(stdout) {
  if (!stdout || typeof stdout !== 'string') return '';
  const marker = '========== AI 日报整理（摘要） ==========';
  const idx = stdout.indexOf(marker);
  if (idx === -1) return '';
  // 从标记行之后开始
  const after = stdout.slice(idx + marker.length);
  return after.replace(/^\s+/, '');
}

/**
 * 立即执行指定任务一次，返回 stdout、stderr、exitCode
 */
function runJobNow(job) {
  const cmd = buildCommandForJob(job);
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 60000,
    });
    return { ok: true, stdout: stdout || '', stderr: '', code: 0 };
  } catch (e) {
    const stdout = (e.stdout && String(e.stdout)) || '';
    const stderr = (e.stderr && String(e.stderr)) || e.message || '';
    const code = e.status != null ? e.status : 1;
    return { ok: false, stdout, stderr, code };
  }
}

module.exports = {
  readSystemCrontab,
  splitCrontab,
  buildManagerBlock,
  syncToSystem,
  getRawCrontab,
  buildCommandForJob,
  runJobNow,
  notifyWebhook,
};
