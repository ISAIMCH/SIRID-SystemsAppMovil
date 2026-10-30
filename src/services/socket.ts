import { io, type Socket } from 'socket.io-client';

import { apiOrigin } from '../features/gymgo/api';
import { readAccessToken } from '../features/gymgo/token-storage';

export const socket: Socket = io(apiOrigin, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  // Read on every (re)connect so the socket always uses the current session token.
  auth: (callback) => {
    void readAccessToken().then((token) => callback({ token }), () => callback({}));
  },
});

export function connectSocket() {
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket.disconnect();
}
