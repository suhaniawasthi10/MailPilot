import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Emails from './pages/Emails'
import Commitments from './pages/Commitments'
import Settings from './pages/Settings'
import Layout from './components/Layout'
import { ConnectionProvider } from './context/ConnectionContext'

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Signing you in...</span>
        </div>
      </div>
    )
  }

  return <Navigate to={hasToken ? '/dashboard' : '/login'} />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" />
  return (
    <ConnectionProvider>
      <Layout>{children}</Layout>
    </ConnectionProvider>
  )
}

function App() {
  const token = localStorage.getItem('token')

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/emails" element={<ProtectedRoute><Emails /></ProtectedRoute>} />
      <Route path="/commitments" element={<ProtectedRoute><Commitments /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<TokenHandler />} />
    </Routes>
  )
}

export default App
