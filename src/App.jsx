// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import StockOnHand from './StockOnHand'
import StockLevels from './StockLevels'
import AssetRegister from './AssetRegister'
import ComplianceReport from './ComplianceReport'
import Receipt from './Receipt'
import IssueReturn from './IssueReturn'
import ProductsControl from './ProductsControl'
import AssetIntake from './AssetIntake'
import UncodedAssets from './UncodedAssets'
import AssetMove from './AssetMove'
import './App.css'

const VIEWS = {
  stock:       { label: 'Stock on hand',  component: StockOnHand },
  stocklevels: { label: 'Stock levels',   component: StockLevels },
  assets:      { label: 'Asset register', component: AssetRegister },
  assetintake: { label: 'Asset intake',   component: AssetIntake },
  uncoded:     { label: 'Uncoded assets', component: UncodedAssets },
  assetmove:   { label: 'Asset move',     component: AssetMove },
  compliance:  { label: 'Compliance',     component: ComplianceReport },
  receipt:     { label: 'Receive stock',  component: Receipt },
  issue:       { label: 'Issue / return', component: IssueReturn },
  products:    { label: 'Products',       component: ProductsControl },
}

const EMPTY_RECEIPT = { our_order_ref: '', supplier_order_ref: '', lines: [] }
const EMPTY_PICK = { mode: 'issue', project_id: '', lines: [] }

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('stock')
  const [receiptForm, setReceiptForm] = useState(EMPTY_RECEIPT)
  const [pickForm, setPickForm] = useState(EMPTY_PICK)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading) return <div className="app-loading">Loading…</div>
  if (!session) return <Login />

  const ActiveScreen = VIEWS[view].component

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Stock App</h1>
        <div className="app-user">
          <span>{session.user.email}</span>
          <button onClick={handleLogout}>Sign out</button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-nav">
          {Object.entries(VIEWS).map(([key, { label }]) => (
            <button
              key={key}
              className={key === view ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <main className="app-main">
          <h2>{VIEWS[view].label}</h2>
          <ActiveScreen
            receiptForm={receiptForm}
            setReceiptForm={setReceiptForm}
            resetReceipt={() => setReceiptForm(EMPTY_RECEIPT)}
            pickForm={pickForm}
            setPickForm={setPickForm}
            resetPick={() => setPickForm(EMPTY_PICK)}
          />
        </main>
      </div>
    </div>
  )
}