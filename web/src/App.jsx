import { useState, useEffect } from 'react'
import { api } from './api'
import { JobList } from './components/JobList'
import { JobForm } from './components/JobForm'
import { SyncButton } from './components/SyncButton'
import { CrontabRaw } from './components/CrontabRaw'
import './App.css'

export default function App() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showCrontab, setShowCrontab] = useState(false)

  const loadJobs = async () => {
    setLoading(true)
    setError(null)
    try {
      const { jobs: list } = await api.getJobs()
      setJobs(list)
    } catch (e) {
      setError(e.message)
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const handleSave = async (payload) => {
    try {
      if (editingId) {
        await api.updateJob(editingId, payload)
      } else {
        await api.createJob(payload)
      }
      setEditingId(null)
      setShowAdd(false)
      await loadJobs()
    } catch (e) {
      throw e
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定删除该任务？')) return
    try {
      await api.deleteJob(id)
      await loadJobs()
      if (editingId === id) setEditingId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRunJob = async (id) => {
    setError(null)
    try {
      const result = await api.runJob(id)
      return result
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  const handleSync = async () => {
    setError(null)
    try {
      const res = await api.sync()
      await loadJobs()
      return res
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Crontab 定时任务</h1>
        <p className="app-subtitle">管理本地 cron 任务，配置保存在项目 cron-jobs.yaml</p>
        <div className="app-actions">
          <SyncButton onSync={handleSync} />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCrontab((v) => !v)}
          >
            {showCrontab ? '隐藏' : '查看'} Crontab
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditingId(null)
              setShowAdd(true)
            }}
          >
            新增任务
          </button>
        </div>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {showCrontab && <CrontabRaw onClose={() => setShowCrontab(false)} />}

      {(showAdd || editingId) && (
        <JobForm
          job={editingId ? jobs.find((j) => j.id === editingId) ?? null : null}
          onSave={handleSave}
          onCancel={() => {
            setShowAdd(false)
            setEditingId(null)
          }}
        />
      )}

      <main className="app-main">
        {loading ? (
          <div className="loading">加载中…</div>
        ) : (
          <JobList
            jobs={jobs}
            onEdit={setEditingId}
            onDelete={handleDelete}
            onRun={handleRunJob}
          />
        )}
      </main>
    </div>
  )
}
