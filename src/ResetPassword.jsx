// src/ResetPassword.jsx
import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    setError(null)
    if (!password.trim()) { setError('Enter a new password.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) { setError(error.message); return }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="brand" style={{ marginBottom: '1.5rem' }}>
            <span className="brand-name">7Formation.co.uk</span>
            <span className="brand-tag">Forward Thinking Construction Solutions</span>
          </div>
          <div className="form-success">Password updated successfully.</div>
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <button onClick={onDone}>Continue to the app</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand" style={{ marginBottom: '1.5rem' }}>
          <span className="brand-name">7Formation.co.uk</span>
          <span className="brand-tag">Forward Thinking Construction Solutions</span>
        </div>
        <h3 className="form-title">Set a new password</h3>

        <div className="form-field">
          <label>New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" />
        </div>
        <div className="form-field">
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Set password'}</button>
        </div>
      </div>
    </div>
  )
}