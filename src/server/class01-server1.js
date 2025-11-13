// Servidor TCP basico -> sockets v1

import net from 'net';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT_TCP || 7000;

const server = net.createServer(socket => {
  console.log('Cliente conectado:', socket.remoteAddress + ':' + socket.remotePort);
  socket.setEncoding('utf8');
  socket.on('data', data => {
    const line = data.toString().trim(); // eliminar espacios en blanco
    console.log('Recibido:', line);
    socket.write(`ACK: ${line}\n`);
  });
  socket.on('end', () => console.log('Cliente desconectado'));
  socket.on('error', err => console.error('Socket error', err.message));
});

server.listen(PORT, () => console.log(`Servidor TCP escuchando en ${PORT}`));


/* Documentacion: 
net.createServer -> https://nodejs.org/api/net.html#netcreateserveroptions-connectionlistener:~:text=starts%20the%20connection.-,net.createServer(%5Boptions%5D%5B%2C%20connectionListener%5D),-%23
socket.wirte -> https://nodejs.org/api/net.html#socketwritedata-encoding-callback:~:text=have%20no%20effect.-,socket.write(data%5B%2C%20encoding%5D%5B%2C%20callback%5D),-%23
*/