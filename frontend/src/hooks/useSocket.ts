/**
 * useSocket Hook
 *
 * Manages a persistent WebSocket connection to the backend.
 * The connection is authenticated using the same JWT token
 * that the REST API uses (from localStorage).
 *
 * Usage:
 *   const socket = useSocket()
 *   useEffect(() => {
 *     if (!socket) return
 *     socket.on('email:new', (email) => { ... })
 *     return () => { socket.off('email:new') }
 *   }, [socket])
 *
 * Key behaviors:
 * - Connects once when the component mounts
 * - Reconnects automatically if the connection drops
 * - Disconnects when the component unmounts (cleanup)
 * - Returns null if there's no auth token (user not logged in)
 */

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null)
  // useRef prevents reconnecting on every re-render
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    // Create the Socket.io connection
    // The `auth` option sends the JWT during the handshake
    const newSocket = io(API_URL, {
      auth: { token },
      // Don't auto-connect on import — we control when it connects
      autoConnect: true,
      // Reconnect automatically if connection drops
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })

    newSocket.on('connect', () => {
      console.log('WebSocket connected')
    })

    newSocket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err.message)
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    // Cleanup: disconnect when component unmounts
    return () => {
      newSocket.disconnect()
      socketRef.current = null
    }
  }, []) // Empty deps — connect once on mount

  return socket
}
