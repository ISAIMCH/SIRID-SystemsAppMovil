import { io, type Socket } from 'socket.io-client';

import { apiOrigin } from '../features/gymgo/api';

export const socket: Socket = io(apiOrigin, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

export function connectSocket() {
  if (!socket.connected) socket.connect();
  return socket;
}
