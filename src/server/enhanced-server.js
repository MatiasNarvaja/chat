// Servidor TCP mejorado con múltiples clientes, broadcast y comandos
import net from 'net';
import fs from 'fs';
import path from 'path';

// Configuración
const PORT = process.env.PORT_TCP || 7000;
const LOG_FILE = './logs/chat.log';

// Asegurar que el directorio de logs existe
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Stream de logging
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Almacén de clientes conectados
const clients = new Map(); // Map para mejor gestión de clientes
let clientCounter = 0;

// Función para logging
function logMessage(type, data) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${type}: ${data}\n`;
  logStream.write(logEntry);
  console.log(logEntry.trim());
}

// Función para broadcast a todos los clientes
function broadcast(message, excludeSocket = null) {
  const timestamp = new Date().toLocaleTimeString();
  const formattedMessage = `[${timestamp}] ${message}\n`;
  
  clients.forEach((client, socket) => {
    if (socket !== excludeSocket && !socket.destroyed) {
      socket.write(formattedMessage);
    }
  });
}

// Función para obtener lista de usuarios conectados
function getConnectedUsers() {
  return Array.from(clients.values())
    .map(client => client.nickname)
    .join(', ');
}

// Función para procesar comandos
function processCommand(socket, message) {
  const parts = message.split(' ');
  const command = parts[0].toLowerCase();
  const client = clients.get(socket);

  switch (command) {
    case '/nick':
      const newNick = parts[1];
      if (!newNick) {
        socket.write('❌ Uso: /nick <nuevo_nombre>\n');
        return true;
      }
      if (newNick.length > 20) {
        socket.write('❌ El nickname no puede tener más de 20 caracteres\n');
        return true;
      }
      
      const oldNick = client.nickname;
      client.nickname = newNick;
      logMessage('NICK_CHANGE', `${oldNick} cambió su nick a ${newNick}`);
      broadcast(`🔄 ${oldNick} ahora se llama ${newNick}`, socket);
      socket.write(`✅ Tu nickname ahora es: ${newNick}\n`);
      return true;

    case '/lista':
    case '/list':
    case '/users':
      const userList = getConnectedUsers();
      socket.write(`👥 Usuarios conectados (${clients.size}): ${userList}\n`);
      return true;

    case '/salir':
    case '/quit':
    case '/exit':
      socket.write('👋 ¡Hasta luego!\n');
      socket.end();
      return true;

    case '/help':
    case '/ayuda':
      const helpText = `
📋 Comandos disponibles:
/nick <nombre>  - Cambiar tu nickname
/lista          - Ver usuarios conectados
/salir          - Salir del chat
/help           - Mostrar esta ayuda
      `.trim();
      socket.write(helpText + '\n');
      return true;

    default:
      return false; // No es un comando reconocido
  }
}

// Crear servidor TCP
const server = net.createServer((socket) => {
  // Configurar socket
  socket.setEncoding('utf8');
  socket.setNoDelay(true); // Deshabilitar Nagle para mejor latencia
  
  // Generar ID único para el cliente
  clientCounter++;
  const clientId = `Cliente_${clientCounter}`;
  
  // Crear objeto cliente
  const client = {
    id: clientId,
    nickname: clientId,
    ip: socket.remoteAddress,
    port: socket.remotePort,
    connectedAt: new Date()
  };
  
  // Agregar cliente al mapa
  clients.set(socket, client);
  
  // Mensaje de bienvenida
  const welcomeMsg = `
🎉 ¡Bienvenido al chat!
Tu nickname es: ${client.nickname}
Usuarios conectados: ${clients.size}
Escribe /help para ver comandos disponibles
Escribe /salir para desconectarte

💬 ¡Comienza a chatear!
    `.trim();
  
  socket.write(welcomeMsg + '\n');
  
  // Notificar a otros usuarios
  broadcast(`🟢 ${client.nickname} se ha conectado`, socket);
  logMessage('CONNECT', `${client.nickname} (${client.ip}:${client.port}) se conectó`);

  // Configurar timeout de inactividad (60 segundos)
  socket.setTimeout(60000);

  // Manejar datos recibidos
  socket.on('data', (data) => {
    // Resetear timeout cuando recibimos datos
    socket.setTimeout(60000);
    
    const message = data.toString().trim();
    
    if (!message) return; // Ignorar mensajes vacíos
    
    // Manejar pings para mantener conexión viva
    if (message === 'PING') {
      socket.write('PONG\n');
      return;
    }
    
    // Procesar comandos
    if (message.startsWith('/')) {
      const isCommand = processCommand(socket, message);
      if (isCommand) {
        logMessage('COMMAND', `${client.nickname}: ${message}`);
        return;
      }
    }
    
    // Procesar mensaje normal
    const chatMessage = `${client.nickname}: ${message}`;
    logMessage('MESSAGE', chatMessage);
    broadcast(chatMessage, socket);
  });

  // Manejar timeout de inactividad
  socket.on('timeout', () => {
    logMessage('TIMEOUT', `${client.nickname} - timeout de inactividad`);
    socket.end();
  });

  // Manejar desconexión
  socket.on('end', () => {
    const client = clients.get(socket);
    if (client) {
      broadcast(`🔴 ${client.nickname} se ha desconectado`, socket);
      logMessage('DISCONNECT', `${client.nickname} se desconectó`);
      clients.delete(socket);
    }
  });

  // Manejar errores
  socket.on('error', (err) => {
    const client = clients.get(socket);
    if (client) {
      logMessage('ERROR', `Error en ${client.nickname}: ${err.message}`);
      clients.delete(socket);
    }
  });

  // Limpiar cliente si se cierra la conexión
  socket.on('close', () => {
    clients.delete(socket);
  });
});

// Manejar errores del servidor
server.on('error', (err) => {
  logMessage('SERVER_ERROR', err.message);
  console.error('Error del servidor:', err);
});

// Iniciar servidor
server.listen(PORT, () => {
  logMessage('SERVER_START', `Servidor iniciado en puerto ${PORT}`);
  console.log(`
🚀 Servidor TCP Chat iniciado
📡 Puerto: ${PORT}
📁 Logs: ${LOG_FILE}
👥 Clientes conectados: ${clients.size}

Esperando conexiones...
  `);
});

// Manejo graceful de cierre
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  
  // Notificar a todos los clientes
  broadcast('🔴 El servidor se está cerrando. ¡Hasta luego!');
  
  // Cerrar todas las conexiones
  clients.forEach((client, socket) => {
    socket.end();
  });
  
  // Cerrar servidor y streams
  server.close(() => {
    logStream.end();
    logMessage('SERVER_STOP', 'Servidor cerrado correctamente');
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

// Exportar para testing
export { server, clients, broadcast, logMessage };
