import { useState } from 'react'
import { RunResult } from './RunResult'
import './JobList.css'

function formatNextRun(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function JobList({ jobs, onEdit, onDelete, onRun }) {
  const [runningId, setRunningId] = useState(null)
  const [runResult, setRunResult] = useState(null)

  const handleRun = async (id) => {
    setRunningId(id)
    setRunResult(null)
    try {
      const result = await onRun(id)
      setRunResult({ jobId: id, ...result })
    } catch (e) {
      const msg = e?.message || '请求失败'
      setRunResult({ jobId: id, ok: false, stdout: '', stderr: msg, code: 1 })
    } finally {
      setRunningId(null)
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="job-list-empty">
        <p>暂无任务，点击「新增任务」添加后，记得「同步到 Crontab」。</p>
      </div>
    )
  }

  return (
    <ul className="job-list">
      {jobs.map((job, i) => (
        <li
          key={job.id}
          className="job-item"
          style={{ animationDelay: `${i * 0.04}s` }}
        >
          <div className="job-item-main">
            <div className="job-item-head">
              <span className="job-name">{job.name}</span>
              <span className={`job-badge ${job.enabled ? 'enabled' : 'disabled'}`}>
                {job.enabled ? '启用' : '禁用'}
              </span>
            </div>
            <div className="job-item-meta">
              <code className="job-schedule">{job.schedule}</code>
              <span className="job-script">{job.script}</span>
            </div>
            {job.nextRun && (
              <div className="job-next-run">
                下次运行: {formatNextRun(job.nextRun)}
              </div>
            )}
          </div>
          <div className="job-item-actions">
            <button
              type="button"
              className="btn btn-run btn-small"
              onClick={() => handleRun(job.id)}
              disabled={runningId != null}
              title="立即执行一次（测试用）"
            >
              {runningId === job.id ? '执行中…' : '立即执行'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => onEdit(job.id)}
            >
              编辑
            </button>
            <button
              type="button"
              className="btn btn-danger btn-small"
              onClick={() => onDelete(job.id)}
            >
              删除
            </button>
          </div>
        </li>
      ))}
      {runResult && (
        <RunResult
          result={runResult}
          onClose={() => setRunResult(null)}
        />
      )}
    </ul>
  )
}
