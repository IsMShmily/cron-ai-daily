/**
 * 读写 cron-jobs.yaml 配置文件
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_FILENAME = 'cron-jobs.yaml';

function getProjectRoot() {
  return path.resolve(__dirname, '..');
}

function getConfigPath() {
  return path.join(getProjectRoot(), CONFIG_FILENAME);
}

function getScriptsDir() {
  return path.join(getProjectRoot(), 'scripts');
}

/**
 * @returns {{ jobs: Array<{ id: string, name: string, schedule: string, script: string, args?: object, enabled?: boolean }> }}
 */
function read() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { jobs: [] };
  }
  const content = fs.readFileSync(configPath, 'utf8');
  const data = yaml.load(content);
  if (!data || typeof data !== 'object') {
    return { jobs: [] };
  }
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return { jobs };
}

/**
 * @param {{ jobs: Array }} data
 */
function write(data) {
  const configPath = getConfigPath();
  const content = yaml.dump(data, { lineWidth: -1 });
  fs.writeFileSync(configPath, content, 'utf8');
}

/**
 * 获取单个任务
 */
function getJobById(id) {
  const { jobs } = read();
  return jobs.find((j) => j.id === id) || null;
}

/**
 * 新增任务（写入 YAML）
 */
function addJob(job) {
  const data = read();
  if (data.jobs.some((j) => j.id === job.id)) {
    throw new Error(`任务 id 已存在: ${job.id}`);
  }
  data.jobs.push({
    id: job.id,
    name: job.name || job.id,
    schedule: job.schedule,
    script: job.script,
    args: job.args || {},
    enabled: job.enabled !== false,
    webhook: job.webhook ? String(job.webhook).trim() : undefined,
  });
  write(data);
  return getJobById(job.id);
}

/**
 * 更新任务
 */
function updateJob(id, updates) {
  const data = read();
  const index = data.jobs.findIndex((j) => j.id === id);
  if (index === -1) {
    throw new Error(`任务不存在: ${id}`);
  }
  const current = data.jobs[index];
  const next = {
    ...current,
    ...updates,
    id: current.id,
  };
  data.jobs[index] = next;
  write(data);
  return next;
}

/**
 * 删除任务
 */
function deleteJob(id) {
  const data = read();
  const index = data.jobs.findIndex((j) => j.id === id);
  if (index === -1) {
    throw new Error(`任务不存在: ${id}`);
  }
  data.jobs.splice(index, 1);
  write(data);
  return true;
}

/**
 * 校验 schedule 是否为合法 5 段 cron 表达式
 */
function validateSchedule(schedule) {
  const parts = (schedule || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const parser = require('cron-parser');
  try {
    parser.parseExpression(schedule);
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验 script 是否存在于 scripts 目录
 */
function scriptExists(scriptName) {
  if (!scriptName || typeof scriptName !== 'string') return false;
  const scriptPath = path.join(getScriptsDir(), scriptName);
  return fs.existsSync(scriptPath);
}

module.exports = {
  getProjectRoot,
  getConfigPath,
  getScriptsDir,
  read,
  write,
  getJobById,
  addJob,
  updateJob,
  deleteJob,
  validateSchedule,
  scriptExists,
};
