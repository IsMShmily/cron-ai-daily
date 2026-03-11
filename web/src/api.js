/**
 * 后端 API 封装（开发时通过 Vite 代理到 3846）
 */

const BASE = '';

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body && (method === 'POST' || method === 'PUT')) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  getJobs: () => request('GET', '/api/jobs'),
  getJob: (id) => request('GET', `/api/jobs/${id}`),
  createJob: (job) => request('POST', '/api/jobs', job),
  updateJob: (id, updates) => request('PUT', `/api/jobs/${id}`, updates),
  deleteJob: (id) => request('DELETE', `/api/jobs/${id}`),
  runJob: (id) => request('POST', `/api/jobs/${id}/run`),
  sync: () => request('POST', '/api/sync'),
  getCrontabRaw: () => fetch(`${BASE}/api/crontab/raw`).then((r) => r.text()),
  getScripts: () => request('GET', '/api/scripts'),
};
