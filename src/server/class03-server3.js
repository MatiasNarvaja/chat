import net from 'net';
const clients = new Set();

const server = net.createServer(socket => {
  socket.setEncoding('utf8');
  socket.id = `${socket.remoteAddress}:${socket.remotePort}`;
  socket.nick = socket.id;
  clients.add(socket);
  socket.write('Bienvenido! pon /nick <tuNombre>\n');

  socket.on('data', data => {
    const msg = data.toString().trim();
    if (msg.startsWith('/nick ')) {
      socket.nick = msg.split(' ')[1] || socket.nick;
      socket.write(`Tu nick es ${socket.nick}\n`);
      return;
    }
    for (const c of clients) if (c !== socket) c.write(`${socket.nick}: ${msg}\n`);
  });

  socket.on('end', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
});

server.listen(7000, () => console.log('Servidor multi-cliente en 7000'));
