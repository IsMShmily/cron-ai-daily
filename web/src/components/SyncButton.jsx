import { useState } from 'react'

export function SyncButton({ onSync }) {
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState(null)

  const handleClick = async () => {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await onSync()
      setMessage(res?.message || '已同步到系统 crontab')
    } catch (e) {
      setMessage(e.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="sync-wrap">
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleClick}
        disabled={syncing}
      >
        {syncing ? '同步中…' : '同步到 Crontab'}
      </button>
      {message && (
        <span className={`sync-msg ${message.includes('已同步') ? 'sync-ok' : 'sync-err'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
