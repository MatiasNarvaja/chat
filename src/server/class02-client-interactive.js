// Cliente TCP avanzado (intereactivo) -> sockets v1

import net from 'net';
import readline from 'readline';

const PORT = 7000;
const rl = readline.createInterface(process.stdin, process.stdout);

function startClient() {
  const socket = net.createConnection({ port: PORT }, () => console.log('Conectado al server'));
  socket.setEncoding('utf8');

  socket.on('data', d => console.log('Srv:', d.trim()));
  socket.on('end', () => console.log('Conexión cerrada por servidor'));
  socket.on('error', err => {
    console.error('Socket error', err.message);
    socket.destroy();
    setTimeout(startClient, 2000); // reintentar
  });

  rl.on('line', line => {
    if (line === '/quit') { socket.end(); rl.close(); return; }
    socket.write(line + '\n');
  });
}

startClient();
