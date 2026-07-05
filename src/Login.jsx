// src/Login.jsx
import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState(null)
  const [resetSending, setResetSending] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

   async function handleReset() {
       setResetError(null)
       if (!resetEmail.trim()) { setResetError('Enter your email address.'); return }
       setResetSending(true)
       const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
           redirectTo: 'https://7fstock-app.netlify.app',
       })
       setResetSending(false)
       if (error) { setResetError(error.message); return }
       setResetSent(true)
   }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h1>7Formation - Stock App</h1>
        <p>Sign in to continue</p>

        {forgotMode ? (
          resetSent ? (
            <div>
              <div className="form-success">
                A reset link has been sent to {resetEmail}. Check your inbox, then click the link to set a new password.
              </div>
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail('') }}>Back to sign in</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#666' }}>Enter your email and we'll send a link to reset your password.</p>
              <label>
                Email
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              {resetError && <p className="login-error">{resetError}</p>}
              <button onClick={handleReset} disabled={resetSending} style={{ marginTop: '0.5rem' }}>
                {resetSending ? 'Sending…' : 'Send reset link'}
              </button>
              <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                <button className="btn-link" onClick={() => { setForgotMode(false); setResetError(null) }}>Back to sign in</button>
              </div>
            </div>
          )
        ) : (
          <form onSubmit={handleLogin}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
              <button type="button" className="btn-link" onClick={() => setForgotMode(true)}>Forgot password?</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
  }