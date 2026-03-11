import './RunResult.css'

export function RunResult({ result, onClose }) {
  const { ok, stdout, stderr, code } = result

  return (
    <li className="run-result-wrap">
      <div className="run-result-card">
        <div className="run-result-header">
          <span className={`run-result-status ${ok ? 'success' : 'failed'}`}>
            {ok ? '执行成功' : `执行失败 (exit code ${code})`}
          </span>
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            关闭
          </button>
        </div>
        {(stdout || stderr) && (
          <div className="run-result-body">
            {stdout && (
              <div className="run-result-block">
                <div className="run-result-label">标准输出</div>
                <pre className="run-result-output">{stdout}</pre>
              </div>
            )}
            {stderr && (
              <div className="run-result-block">
                <div className="run-result-label run-result-label-err">标准错误</div>
                <pre className="run-result-output run-result-output-err">{stderr}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
