/**
 * SocketContext
 *
 * Provides a single, persistent WebSocket connection shared across
 * all pages. Lives at the app level so it doesn't disconnect when
 * you navigate between pages.
 *
 * The socket is created OUTSIDE of React's lifecycle to avoid
 * StrictMode's double mount/unmount causing reconnect loops.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const SocketContext = createContext<Socket | null>(null)

// Module-level singleton — survives React strict mode remounts
let globalSocket: Socket | null = null

function getOrCreateSocket(): Socket | null {
  const token = localStorage.getItem('token')
  if (!token) return null

  // Reuse existing connected socket
  if (globalSocket?.connected) return globalSocket

  // Clean up old disconnected socket
  if (globalSocket) {
    globalSocket.disconnect()
  }

  globalSocket = io(API_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  })

  return globalSocket
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    const s = getOrCreateSocket()
    setSocket(s)

    // Don't disconnect on unmount — the socket is global
    // It only disconnects on logout (when token is removed)
  }, [])

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}

// Call this on logout to clean up the socket
export function disconnectSocket() {
  if (globalSocket) {
    globalSocket.disconnect()
    globalSocket = null
  }
}

export function useSocket() {
  return useContext(SocketContext)
}
