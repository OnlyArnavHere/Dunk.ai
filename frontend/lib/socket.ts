import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    // Connect to backend server (defaulting to localhost:4000)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
    socket = io(backendUrl, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}
