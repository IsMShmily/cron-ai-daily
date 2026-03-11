#!/usr/bin/env node
/**
 * 包装脚本：先执行实际任务脚本，结束后将 stdout/stderr/exitCode 以 JSON 推送到 Webhook
 * 用法: node run-with-webhook.js <webhook_url> -- <script_path> [script_arg1] [script_arg2] ...
 */

const { spawn } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);
const sepIdx = argv.indexOf('--');
if (sepIdx === -1 || sepIdx < 1) {
  console.error('用法: node run-with-webhook.js <webhook_url> [job_id] [job_name] -- <script_path> [args...]');
  process.exit(1);
}

const webhookUrl = argv[0];
const jobId = sepIdx >= 2 ? argv[1] : '';
const jobName = sepIdx >= 3 ? argv[2] : '';
const scriptPath = argv[sepIdx + 1];
const scriptArgs = argv.slice(sepIdx + 2);

if (!webhookUrl || !scriptPath) {
  console.error('缺少 webhook_url 或 script_path');
  process.exit(1);
}

const nodePath = process.execPath;
const ext = path.extname(scriptPath).toLowerCase();
const isJs = ext === '.js';
const cmd = isJs ? nodePath : scriptPath;
const cmdArgs = isJs ? [scriptPath, ...scriptArgs] : scriptArgs;

const child = spawn(cmd, cmdArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

child.on('close', (code, signal) => {
  const exitCode = code != null ? code : (signal ? 1 : 0);
  const payload = {
    jobId: jobId || undefined,
    name: jobName || undefined,
    ok: exitCode === 0,
    stdout: stdout || '',
    stderr: stderr || '',
    code: exitCode,
    timestamp: new Date().toISOString(),
  };

  const fullUrl = webhookUrl.startsWith('http') ? webhookUrl : `https://${webhookUrl}`;
  const u = new URL(fullUrl);
  const mod = u.protocol === 'https:' ? require('https') : require('http');
  const isLarkBot = /open\.larksuite\.com\/open-apis\/bot\/v2\/hook\//.test(fullUrl);

  let bodyObj = payload;
  if (isLarkBot) {
    const { jobId, name, ok, code, stdout, timestamp } = payload;
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
  const req = mod.request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, () => {
    process.exit(exitCode);
  });
  req.on('error', (err) => {
    console.error('Webhook 推送失败:', err.message);
    process.exit(exitCode);
  });
  req.write(body);
  req.end();
});

function extractAiSummary(stdout) {
  if (!stdout || typeof stdout !== 'string') return '';
  const marker = '========== AI 日报整理（摘要） ==========';
  const idx = stdout.indexOf(marker);
  if (idx === -1) return '';
  const after = stdout.slice(idx + marker.length);
  return after.replace(/^\s+/, '');
}
