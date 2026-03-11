/**
 * 任务 CRUD 与同步 API（挂载到 /api）
 * GET/POST /api/jobs, GET/PUT/DELETE /api/jobs/:id, POST /api/sync, GET /api/crontab/raw
 */

const Router = require('@koa/router');
const config = require('../config');
const crontab = require('../crontab');
const cronParser = require('cron-parser');

const router = new Router({ prefix: '/api' });

function getNextRun(schedule) {
  try {
    const it = cronParser.parseExpression(schedule);
    return it.next().toDate().toISOString();
  } catch {
    return null;
  }
}

/**
 * GET /api/jobs - 列表
 */
router.get('/jobs', (ctx) => {
  try {
    const { jobs } = config.read();
    const list = jobs.map((j) => ({
      ...j,
      nextRun: getNextRun(j.schedule),
    }));
    ctx.body = { jobs: list };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

/**
 * POST /api/jobs/:id/run - 立即执行该任务一次（需放在 GET /jobs/:id 之前以免被误匹配）
 * 若任务配置了 webhook，执行结束后会推送结果到该 URL
 */
router.post('/jobs/:id/run', async (ctx) => {
  try {
    const job = config.getJobById(ctx.params.id);
    if (!job) {
      ctx.status = 404;
      ctx.body = { error: '任务不存在' };
      return;
    }
    // 调试：打印立即执行的任务信息
    console.log('[run-job-now] 收到立即执行请求', {
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      script: job.script,
      hasWebhook: !!job.webhook,
      webhook: job.webhook,
    });
    const result = crontab.runJobNow(job);
    console.log('[run-job-now] 执行结果', {
      id: job.id,
      ok: result.ok,
      code: result.code,
    });
    if (job.webhook) {
      const payload = { jobId: job.id, name: job.name, ...result, timestamp: new Date().toISOString() };
      try {
        console.log('[run-job-now] 开始调用 webhook', {
          id: job.id,
          webhook: job.webhook,
        });
        await crontab.notifyWebhook(job.webhook, payload);
        console.log('[run-job-now] webhook 调用完成', { id: job.id });
      } catch (err) {
        // 理论上 notifyWebhook 内部不会抛错，这里加一层兜底日志
        console.log('[run-job-now] webhook 调用异常(已捕获)', {
          id: job.id,
          message: err && err.message,
        });
      }
    }
    ctx.body = result;
  } catch (e) {
    ctx.status = 500;
    ctx.body = { ok: false, error: e.message, stdout: '', stderr: e.message, code: 1 };
  }
});

/**
 * GET /api/jobs/:id - 单条
 */
router.get('/jobs/:id', (ctx) => {
  try {
    const job = config.getJobById(ctx.params.id);
    if (!job) {
      ctx.status = 404;
      ctx.body = { error: '任务不存在' };
      return;
    }
    ctx.body = { ...job, nextRun: getNextRun(job.schedule) };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

/**
 * POST /api/jobs - 新增
 */
router.post('/jobs', (ctx) => {
  try {
    const { id, name, schedule, script, args, enabled, webhook } = ctx.request.body || {};
    if (!id || !schedule || !script) {
      ctx.status = 400;
      ctx.body = { error: '缺少必填: id, schedule, script' };
      return;
    }
    if (!config.validateSchedule(schedule)) {
      ctx.status = 400;
      ctx.body = { error: '无效的 cron 表达式（需 5 段）' };
      return;
    }
    if (!config.scriptExists(script)) {
      ctx.status = 400;
      ctx.body = { error: `脚本不存在: scripts/${script}` };
      return;
    }
    const job = config.addJob({
      id: String(id).trim(),
      name: name || id,
      schedule: String(schedule).trim(),
      script: String(script).trim(),
      args: args || {},
      enabled: enabled !== false,
      webhook: webhook != null ? String(webhook).trim() : undefined,
    });
    ctx.status = 201;
    ctx.body = { ...job, nextRun: getNextRun(job.schedule) };
  } catch (e) {
    ctx.status = 400;
    ctx.body = { error: e.message };
  }
});

/**
 * PUT /api/jobs/:id - 更新
 */
router.put('/jobs/:id', (ctx) => {
  try {
    const { name, schedule, script, args, enabled, webhook } = ctx.request.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (webhook !== undefined) updates.webhook = webhook != null ? String(webhook).trim() : undefined;
    if (schedule !== undefined) {
      if (!config.validateSchedule(schedule)) {
        ctx.status = 400;
        ctx.body = { error: '无效的 cron 表达式' };
        return;
      }
      updates.schedule = schedule;
    }
    if (script !== undefined) {
      if (!config.scriptExists(script)) {
        ctx.status = 400;
        ctx.body = { error: `脚本不存在: scripts/${script}` };
        return;
      }
      updates.script = script;
    }
    if (args !== undefined) updates.args = args;
    if (enabled !== undefined) updates.enabled = enabled;

    const job = config.updateJob(ctx.params.id, updates);
    ctx.body = { ...job, nextRun: getNextRun(job.schedule) };
  } catch (e) {
    if (e.message.startsWith('任务不存在')) {
      ctx.status = 404;
      ctx.body = { error: e.message };
      return;
    }
    ctx.status = 400;
    ctx.body = { error: e.message };
  }
});

/**
 * DELETE /api/jobs/:id - 删除
 */
router.delete('/jobs/:id', (ctx) => {
  try {
    config.deleteJob(ctx.params.id);
    ctx.body = { ok: true };
  } catch (e) {
    if (e.message.startsWith('任务不存在')) {
      ctx.status = 404;
      ctx.body = { error: e.message };
      return;
    }
    ctx.status = 400;
    ctx.body = { error: e.message };
  }
});

/**
 * POST /api/sync - 同步到系统 crontab
 */
router.post('/sync', (ctx) => {
  try {
    const result = crontab.syncToSystem();
    ctx.body = result;
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

/**
 * GET /api/crontab/raw - 当前 crontab 原始内容（调试）
 */
router.get('/crontab/raw', (ctx) => {
  try {
    const raw = crontab.getRawCrontab();
    ctx.type = 'text/plain';
    ctx.body = raw || '(无 crontab)';
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

/**
 * GET /api/scripts - 可选脚本列表（scripts 目录下的文件名）
 */
router.get('/scripts', (ctx) => {
  try {
    const fs = require('fs');
    const scriptsDir = config.getScriptsDir();
    if (!fs.existsSync(scriptsDir)) {
      ctx.body = { scripts: [] };
      return;
    }
    const names = fs.readdirSync(scriptsDir).filter((f) => !f.startsWith('.'));
    ctx.body = { scripts: names };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { error: e.message };
  }
});

module.exports = router;
