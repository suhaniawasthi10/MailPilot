import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Emails from './pages/Emails'
import Commitments from './pages/Commitments'
import Settings from './pages/Settings'
import Ask from './pages/Ask'
import Layout from './components/Layout'
import { ConnectionProvider } from './context/ConnectionContext'
import { SocketProvider } from './context/SocketContext'

function TokenHandler() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      localStorage.setItem('token', token)
      navigate('/dashboard', { replace: true })
    }
  }, [searchParams, navigate])

  const hasToken = localStorage.getItem('token')
  if (searchParams.get('token')) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-soft">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm italic">Signing you in…</span>
        </div>
      </div>
    )
  }

  return <Navigate to={hasToken ? '/dashboard' : '/login'} />
}

function ProtectedRoutes() {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" />
  return (
    <ConnectionProvider>
      <SocketProvider>
        <Layout>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/emails" element={<Emails />} />
            <Route path="/commitments" element={<Commitments />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </SocketProvider>
    </ConnectionProvider>
  )
}

function App() {
  const token = localStorage.getItem('token')

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/" element={<TokenHandler />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}

export default App
