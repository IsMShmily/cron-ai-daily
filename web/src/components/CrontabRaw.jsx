import { useState, useEffect } from 'react'
import { api } from '../api'

export function CrontabRaw({ onClose }) {
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getCrontabRaw().then(setRaw).finally(() => setLoading(false))
  }, [])

  return (
    <div className="crontab-raw-overlay">
      <div className="crontab-raw-card">
        <div className="crontab-raw-header">
          <h3>当前 Crontab 内容</h3>
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            关闭
          </button>
        </div>
        <pre className="crontab-raw-content">
          {loading ? '加载中…' : raw || '(无 crontab)'}
        </pre>
      </div>
    </div>
  )
}
