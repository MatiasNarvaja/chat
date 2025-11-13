// Cliente TCP basico -> sockets v1

import net from 'net';

const socket = net.createConnection({ port: 7000 }, () => {
  console.log('Conectado al servidor');
  socket.write('Hola servidor\n');
});
socket.on('data', d => { console.log('Respuesta:', d.toString()); socket.end(); });
socket.on('error', e => console.error('Error cliente:', e.message));
