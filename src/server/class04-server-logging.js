import net from "net";
import fs from "fs";

// Creamos un stream de log en modo append
const logStream = fs.createWriteStream("./logs/chat.log", { flags: "a" });

// Guardamos los clientes conectados
const clients = new Set();

const server = net.createServer((socket) => {
  socket.setEncoding("utf8");
  socket.id = `${socket.remoteAddress}:${socket.remotePort}`;
  socket.nick = socket.id;
  clients.add(socket);

  socket.write("Bienvenido! Usa /nick <tuNombre> para cambiar tu nombre\n");

  socket.on("data", (data) => {
    const msg = data.toString().trim();

    // comando de nick
    if (msg.startsWith("/nick ")) {
      socket.nick = msg.split(" ")[1] || socket.nick;
      socket.write(`Tu nick ahora es ${socket.nick}\n`);
      return;
    }

    // formatear mensaje con timestamp
    const line = `${new Date().toISOString()} ${socket.nick}: ${msg}\n`;

    // loguear a archivo
    const completeData = `Source: ${socket.id} - User: ${socket.nick} - Message: ${msg}\n`;
    logStream.write(completeData);

    // reenviar a todos menos al emisor
    for (const c of clients) {
      if (c !== socket) c.write(line);
    }
  });

  socket.on("end", () => {
    clients.delete(socket);
    const leaveMsg = `${socket.nick} salió del chat\n`;
    logStream.write(leaveMsg);
    for (const c of clients) c.write(leaveMsg);
  });

  socket.on("error", () => {
    clients.delete(socket);
  });
});

server.listen(7000, () =>
  console.log("Servidor multi-cliente con logs en puerto 7000")
);
