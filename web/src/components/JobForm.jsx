import { useState, useEffect } from 'react'
import { api } from '../api'
import './JobForm.css'

const DEFAULT_SCHEDULE = '30 18 * * *'

// 解析 cron "M H * * *" 为 每天 时:分
function parseDailyCron(schedule) {
  if (!schedule || typeof schedule !== 'string') return null
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [, , day, month, week] = parts
  if (day !== '*' || month !== '*' || week !== '*') return null
  const minute = parseInt(parts[0], 10)
  const hour = parseInt(parts[1], 10)
  if (Number.isNaN(minute) || Number.isNaN(hour)) return null
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null
  return { hour, minute }
}

// 由 时、分 生成每天执行的 cron
function toDailyCron(hour, minute) {
  return `${minute} ${hour} * * *`
}

export function JobForm({ job, onSave, onCancel }) {
  const isEdit = !!job
  const [scripts, setScripts] = useState([])
  const [form, setForm] = useState({
    id: '',
    name: '',
    schedule: DEFAULT_SCHEDULE,
    script: '',
    args: { repoPath: '' },
    enabled: true,
    webhook: '',
  })
  const [scheduleMode, setScheduleMode] = useState('daily') // 'daily' | 'custom'
  const [scheduleHour, setScheduleHour] = useState(18)
  const [scheduleMinute, setScheduleMinute] = useState(30)
  const [argsJson, setArgsJson] = useState('{}')
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getScripts().then(({ scripts: list }) => setScripts(list || []))
  }, [])

  useEffect(() => {
    if (job) {
      const schedule = job.schedule || DEFAULT_SCHEDULE
      const parsed = parseDailyCron(schedule)
      if (parsed) {
        setScheduleMode('daily')
        setScheduleHour(parsed.hour)
        setScheduleMinute(parsed.minute)
      } else {
        setScheduleMode('custom')
      }
      setForm({
        id: job.id,
        name: job.name || job.id,
        schedule,
        script: job.script || '',
        args: job.args || {},
        enabled: job.enabled !== false,
        webhook: job.webhook || '',
      })
      setArgsJson(JSON.stringify(job.args || {}, null, 2))
    } else {
      setScheduleMode('daily')
      setScheduleHour(18)
      setScheduleMinute(30)
      setForm((f) => ({
        ...f,
        id: '',
        name: '',
        schedule: DEFAULT_SCHEDULE,
        script: scripts.length ? scripts[0] : f.script,
        args: {},
        enabled: true,
        webhook: '',
      }))
      setArgsJson('{}')
    }
  }, [job])
  useEffect(() => {
    if (!job && scripts.length) {
      setForm((f) => (f.script && scripts.includes(f.script) ? f : { ...f, script: scripts[0] }))
    }
  }, [scripts, job])

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (field === 'id' && !form.name) setForm((f) => ({ ...f, name: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    let args = form.args
    try {
      args = JSON.parse(argsJson)
    } catch {
      setError('args 必须是合法 JSON')
      return
    }
    const schedule =
      scheduleMode === 'daily'
        ? toDailyCron(scheduleHour, scheduleMinute)
        : form.schedule.trim()
    const payload = {
      id: form.id.trim(),
      name: form.name.trim() || form.id.trim(),
      schedule,
      script: form.script.trim(),
      args,
      enabled: form.enabled,
      webhook: form.webhook ? form.webhook.trim() : '',
    }
    if (!payload.id || !payload.schedule || !payload.script) {
      setError('请填写 id、schedule、script')
      return
    }
    try {
      await onSave(payload)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCancel()
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className="job-form-dialog-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-form-title"
    >
      <div className="job-form-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="job-form-dialog-header">
          <h2 id="job-form-title" className="job-form-title">
            {isEdit ? '编辑任务' : '新增任务'}
          </h2>
          <button
            type="button"
            className="job-form-close"
            onClick={onCancel}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="job-form">
          {error && <div className="banner banner-error">{error}</div>}
          <div className="form-row">
            <label>ID（唯一）</label>
            <input
              type="text"
              value={form.id}
              onChange={(e) => handleChange('id', e.target.value)}
              placeholder="如 git-daily-commits"
              disabled={isEdit}
            />
          </div>
          <div className="form-row">
            <label>名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="显示名称"
            />
          </div>
          <div className="form-row form-row-schedule">
            <label>执行时间</label>
            {scheduleMode === 'daily' ? (
              <div className="schedule-input-row">
                <div className="schedule-mode-tabs">
                  <button
                    type="button"
                    className="schedule-tab active"
                    onClick={() => setScheduleMode('daily')}
                  >
                    每天
                  </button>
                  <button
                    type="button"
                    className="schedule-tab"
                    onClick={() => setScheduleMode('custom')}
                  >
                    自定义 Cron
                  </button>
                </div>
                <div className="schedule-time-picker">
                  <select
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(Number(e.target.value))}
                    className="schedule-select"
                    title="时"
                    aria-label="时"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="schedule-time-sep">:</span>
                  <select
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(Number(e.target.value))}
                    className="schedule-select"
                    title="分"
                    aria-label="分"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="schedule-input-row">
                <div className="schedule-mode-tabs">
                  <button
                    type="button"
                    className="schedule-tab"
                    onClick={() => setScheduleMode('daily')}
                  >
                    每天
                  </button>
                  <button
                    type="button"
                    className="schedule-tab active"
                    onClick={() => setScheduleMode('custom')}
                  >
                    自定义 Cron
                  </button>
                </div>
                <input
                  type="text"
                  value={form.schedule}
                  onChange={(e) => handleChange('schedule', e.target.value)}
                  placeholder="30 18 * * *"
                  className="font-mono schedule-cron-input"
                />
              </div>
            )}
          </div>
          <div className="form-row">
            <label>Webhook URL（选填，执行完成后 POST 结果到此地址）</label>
            <input
              type="url"
              value={form.webhook}
              onChange={(e) => handleChange('webhook', e.target.value)}
              placeholder="https://example.com/webhook 或留空"
              
            />
          </div>
          <div className="form-row">
            <label>脚本</label>
            <select
              value={form.script}
              onChange={(e) => handleChange('script', e.target.value)}
            >
              <option value="">请选择</option>
              {scripts.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>参数 args（JSON，如 {"{ \"repoPath\": \"/path\" }"}）</label>
            <textarea
              value={argsJson}
              onChange={(e) => setArgsJson(e.target.value)}
              rows={4}
              className="font-mono"
              placeholder='{"repoPath": "/path/to/repo"}'
            />
          </div>
          <div className="form-row form-row-check">
            <label>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
              />
              启用
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
