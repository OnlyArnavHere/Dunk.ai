import { io, Socket } from 'socket.io-client'
import { api } from './axios-client'

let socket: Socket | null = null

/**
 * The Socket.io connection to the backend.
 *
 * It connects straight to the backend's origin (rewrites cannot carry a
 * WebSocket on most hosts), but the auth cookies belong to the frontend's
 * origin because API calls go through its /api rewrite. Locally both are
 * `localhost`, so the cookie happened to ride along; hosted on two domains it
 * does not, and every handshake was refused.
 *
 * So the handshake carries a two-minute socket token fetched through the
 * same-origin API. `auth` is a function so socket.io asks for a fresh one on
 * every reconnect, not just the first connect.
 */
export function getSocket(): Socket {
  if (!socket) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
    socket = io(backendUrl, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        api
          .get<unknown, { token: string }>('/auth/socket-token')
          .then(({ token }) => cb({ token }))
          // No token: connect anyway, and let the cookie fallback decide.
          .catch(() => cb({}))
      },
    })
  }
  return socket
}
