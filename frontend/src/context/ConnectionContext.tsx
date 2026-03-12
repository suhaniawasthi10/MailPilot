import { createContext, useContext, useState, useEffect } from 'react'
import api from '../lib/api'
import type { Connection } from '../types'

interface ConnectionContextType {
  connections: Connection[]
  activeConnection: string
  setActiveConnection: (id: string) => void
  loading: boolean
  refresh: () => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextType>({
  connections: [],
  activeConnection: '',
  setActiveConnection: () => {},
  loading: true,
  refresh: async () => {},
})

export const useConnections = () => useContext(ConnectionContext)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConnection, setActiveConnection] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchConnections = async () => {
    try {
      const { data } = await api.get('/api/connections')
      setConnections(data)
      // Only set default if no active connection is selected yet
      if (!activeConnection && data.length > 0) {
        setActiveConnection(data[0]._id)
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConnections()
  }, [])

  return (
    <ConnectionContext.Provider
      value={{
        connections,
        activeConnection,
        setActiveConnection,
        loading,
        refresh: fetchConnections,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  )
}
