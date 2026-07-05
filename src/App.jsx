// src/App.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import StockOnHand from './StockOnHand'
import StockLevels from './StockLevels'
import AssetRegister from './AssetRegister'
import AssetIntake from './AssetIntake'
import UncodedAssets from './UncodedAssets'
import AssetMove from './AssetMove'
import ComplianceReport from './ComplianceReport'
import Receipt from './Receipt'
import IssueReturn from './IssueReturn'
import ProductsControl from './ProductsControl'
import ProjectsControl from './ProjectsControl'
import PeopleControl from './PeopleControl'
import ChangelogModal from './ChangelogModal'
import ServiceTypesControl from './ServiceTypesControl'
import AssetTypeServices from './AssetTypeServices'
import BayView from './BayView'
import PickList from './PickList'
import PickUpload from './PickUpload'
import KitsControl from './KitsControl'
import RolesControl from './RolesControl'
import Transactions from './Transactions'
import StockTake from './StockTake'
import ResetPassword from './ResetPassword'
import './App.css'

// Screens, unchanged — just the component for each key.
const SCREENS = {
  stock:       StockOnHand,
  stocklevels: StockLevels,
  assets:      AssetRegister,
  assetintake: AssetIntake,
  uncoded:     UncodedAssets,
  assetmove:   AssetMove,
  compliance:  ComplianceReport,
  receipt:     Receipt,
  issue:       IssueReturn,
  products:    ProductsControl,
  projects:    ProjectsControl,
  people:      PeopleControl,
  servicetypes: ServiceTypesControl,
  assettypeservices: AssetTypeServices,
  bayview: BayView,
  picklist: PickList,
  pickupload: PickUpload,
  kits: KitsControl,
  roles: RolesControl,
  transactions: Transactions,
  stocktake: StockTake,
}

// The same screens, now organised into named groups for the sidebar.
const NAV_GROUPS = [
  { heading: 'Stock', items: [
    { key: 'stock',       label: 'Stock on hand' },
    { key: 'stocklevels', label: 'Stock levels' },
    { key: 'bayview',     label: 'Bay contents' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'stocktake',    label: 'Stock take' },
  ]},
  { heading: 'Assets', items: [
    { key: 'assets',      label: 'Asset register' },
    { key: 'assetintake', label: 'Asset intake' },
    { key: 'uncoded',     label: 'Uncoded assets' },
    { key: 'compliance',  label: 'Compliance' },
  ]},
  { heading: 'Movements', items: [
    { key: 'receipt',     label: 'Receive stock' },
    { key: 'issue',       label: 'Issue / return' },
    { key: 'assetmove',   label: 'Asset move' },
    { key: 'pickupload', label: 'Upload pick list' },
    { key: 'picklist',  label: 'Pick lists' },
  ]},
   { heading: 'Admin', items: [
    { key: 'products',          label: 'Products' },
    { key: 'projects',          label: 'Projects' },
    { key: 'people',            label: 'People' },
    { key: 'servicetypes',      label: 'Service types' },
    { key: 'assettypeservices', label: 'Asset service rules' },
    { key: 'kits',              label: 'Kits' },
    { key: 'roles',             label: 'Roles' },
  ]},
]

const LABELS = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label]))
)

const EMPTY_RECEIPT = { our_order_ref: '', supplier_order_ref: '', lines: [] }
const EMPTY_PICK = { mode: 'issue', project_id: '', lines: [] }

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('stock')
  const [navOpen, setNavOpen] = useState(false)        // phone menu open?
  const [receiptForm, setReceiptForm] = useState(EMPTY_RECEIPT)
  const [pickForm, setPickForm] = useState(EMPTY_PICK)
  const [showChangelog, setShowChangelog] = useState(false)
  const [allowedScreens, setAllowedScreens] = useState(null)   // null = not yet loaded / fail-open
  const [isSuper, setIsSuper] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await supabase.from('profiles').upsert(
          { id: session.user.id, email: session.user.email },
          { onConflict: 'id', ignoreDuplicates: false }
        )
        await loadAccess(session.user.id)
      }
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (_event === 'PASSWORD_RECOVERY') {
          setResetMode(true)
        }
        if (session?.user) {
          await supabase.from('profiles').upsert(
            { id: session.user.id, email: session.user.email },
            { onConflict: 'id', ignoreDuplicates: false }
          )
          await loadAccess(session.user.id)
        } else {
          setAllowedScreens(null)
          setIsSuper(false)
        }
        setSession(session)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function pick(key) {
    setView(key)
    setNavOpen(false)        // choosing a screen closes the phone menu
  }

  if (loading) return <div className="app-loading">Loading…</div>
  if (resetMode) return <ResetPassword onDone={() => setResetMode(false)} />
  if (!session) return <Login />

  const ActiveScreen = SCREENS[view]

  async function loadAccess(userId) {
    try {
      // Find the person's role.
      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id, roles(code)')
        .eq('id', userId)
        .single()

      // Super users see everything — no filtering.
      if (profile?.roles?.code === 'super') {
        setIsSuper(true)
        setAllowedScreens(null)   // null = show all
        return
      }
      setIsSuper(false)

      // No role assigned → fail open (show everything) for the beta.
      if (!profile?.role_id) {
        setAllowedScreens(null)
        return
      }

      // Read this role's allowed screens.
      const { data: rs } = await supabase
        .from('role_screens')
        .select('screen_key')
        .eq('role_id', profile.role_id)

      // If we got a list, use it; if not, fail open.
      if (rs && rs.length > 0) {
        setAllowedScreens(rs.map((x) => x.screen_key))
      } else {
        setAllowedScreens(null)
      }
    } catch (e) {
      // Any error → fail open, so a glitch never locks anyone out.
      setAllowedScreens(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <button className="hamburger" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">☰</button>
          <div className="brand">
            <span className="brand-name">7Formation.co.uk</span>
            <span className="brand-tag">Forward Thinking Construction Solutions</span>
          </div>
          <button className="version-badge" onClick={() => setShowChangelog(true)} title="View changelog">
            v{__APP_VERSION__}
          </button>
          {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
        </div>
        <div className="app-user">
          <span className="user-email">{session.user.email}</span>
          <button onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className="app-body">
        {/* Backdrop shown behind the menu on phones; tap to close */}
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

        <nav className={navOpen ? 'app-nav open' : 'app-nav'}>
          {NAV_GROUPS.map((group) => {
            // Filter items to those this person may see.
            const items = group.items.filter((item) => {
              // The Roles screen is always available to super users, and never to others.
              if (item.key === 'roles') return isSuper
              // Super users (allowedScreens null) or fail-open → show all.
              if (allowedScreens === null) return true
              return allowedScreens.includes(item.key)
            })
            if (items.length === 0) return null   // hide empty groups
            return (
              <div key={group.heading} className="nav-group">
                <div className="nav-heading">{group.heading}</div>
                {items.map((item) => (
                  <button
                    key={item.key}
                    className={item.key === view ? 'nav-item active' : 'nav-item'}
                    onClick={() => pick(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>

        <main className="app-main">
          <h2>{LABELS[view]}</h2>
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