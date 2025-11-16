// Servidor WebSocket mejorado con múltiples clientes, broadcast y comandos
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const PORT = process.env.PORT_WS || 8080;
const LOG_FILE = './logs/chat.log';

// Asegurar que el directorio de logs existe
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Stream de logging
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Crear servidor HTTP y Express
const app = express();
const server = http.createServer(app);

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, '../../public')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Crear servidor WebSocket
const wss = new WebSocketServer({ server });

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

// Función para enviar mensaje JSON a un cliente
function sendJSON(ws, type, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
  }
}

// Función para broadcast a todos los clientes
function broadcast(type, data, excludeWs = null) {
  const message = JSON.stringify({ 
    type, 
    data, 
    timestamp: new Date().toISOString() 
  });
  
  clients.forEach((client, ws) => {
    if (ws !== excludeWs && ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

// Función para obtener lista de usuarios conectados
function getConnectedUsers() {
  return Array.from(clients.values())
    .map(client => client.nickname);
}

// Función para procesar comandos
function processCommand(ws, message) {
  const parts = message.split(' ');
  const command = parts[0].toLowerCase();
  const client = clients.get(ws);

  switch (command) {
    case '/nick':
      const newNick = parts[1];
      if (!newNick) {
        sendJSON(ws, 'error', { message: '❌ Uso: /nick <nuevo_nombre>' });
        return true;
      }
      if (newNick.length > 20) {
        sendJSON(ws, 'error', { message: '❌ El nickname no puede tener más de 20 caracteres' });
        return true;
      }
      
      const oldNick = client.nickname;
      client.nickname = newNick;
      logMessage('NICK_CHANGE', `${oldNick} cambió su nick a ${newNick}`);
      broadcast('system', { message: `🔄 ${oldNick} ahora se llama ${newNick}` }, ws);
      sendJSON(ws, 'success', { message: `✅ Tu nickname ahora es: ${newNick}` });
      
      // Actualizar lista de usuarios para todos los clientes
      broadcast('users', {
        count: clients.size,
        users: getConnectedUsers()
      });
      return true;

    case '/lista':
    case '/list':
    case '/users':
      const userList = getConnectedUsers();
      sendJSON(ws, 'users', { 
        count: clients.size, 
        users: userList,
        message: `👥 Usuarios conectados (${clients.size}): ${userList.join(', ')}`
      });
      return true;

    case '/salir':
    case '/quit':
    case '/exit':
      sendJSON(ws, 'system', { message: '👋 ¡Hasta luego!' });
      ws.close();
      return true;

    case '/help':
    case '/ayuda':
      const helpText = {
        message: '📋 Comandos disponibles:',
        commands: [
          '/nick <nombre>  - Cambiar tu nickname',
          '/lista          - Ver usuarios conectados',
          '/salir          - Salir del chat',
          '/help           - Mostrar esta ayuda'
        ]
      };
      sendJSON(ws, 'help', helpText);
      return true;

    default:
      return false; // No es un comando reconocido
  }
}

// Manejar conexiones WebSocket
wss.on('connection', (ws, req) => {
  // Generar ID único para el cliente
  clientCounter++;
  const clientId = `Cliente_${clientCounter}`;
  
  // Obtener IP del cliente
  const ip = req.socket.remoteAddress || 'unknown';
  
  // Crear objeto cliente
  const client = {
    id: clientId,
    nickname: clientId,
    ip: ip,
    connectedAt: new Date()
  };
  
  // Agregar cliente al mapa
  clients.set(ws, client);
  
  // Mensaje de bienvenida
  sendJSON(ws, 'welcome', {
    message: '🎉 ¡Bienvenido al chat!',
    nickname: client.nickname,
    usersCount: clients.size,
    help: 'Escribe /help para ver comandos disponibles'
  });
  
  // Notificar a otros usuarios
  broadcast('system', { message: `🟢 ${client.nickname} se ha conectado` }, ws);
  logMessage('CONNECT', `${client.nickname} (${client.ip}) se conectó`);

  // Enviar lista de usuarios actuales al nuevo cliente
  sendJSON(ws, 'users', { 
    count: clients.size, 
    users: getConnectedUsers()
  });

  // Actualizar lista de usuarios para todos los clientes
  broadcast('users', {
    count: clients.size,
    users: getConnectedUsers()
  });

  // Manejar mensajes recibidos
  ws.on('message', (data) => {
    try {
      const message = data.toString().trim();
      
      if (!message) return; // Ignorar mensajes vacíos
      
      // Manejar pings para mantener conexión viva
      if (message === 'PING') {
        ws.send('PONG');
        return;
      }
      
      // Procesar comandos
      if (message.startsWith('/')) {
        const isCommand = processCommand(ws, message);
        if (isCommand) {
          logMessage('COMMAND', `${client.nickname}: ${message}`);
          return;
        }
      }
      
      // Procesar mensaje normal
      const chatMessage = {
        nickname: client.nickname,
        message: message,
        timestamp: new Date().toISOString()
      };
      logMessage('MESSAGE', `${client.nickname}: ${message}`);
      broadcast('message', chatMessage, ws);
    } catch (err) {
      logMessage('ERROR', `Error procesando mensaje: ${err.message}`);
      sendJSON(ws, 'error', { message: 'Error al procesar el mensaje' });
    }
  });

  // Manejar desconexión
  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      broadcast('system', { message: `🔴 ${client.nickname} se ha desconectado` }, ws);
      logMessage('DISCONNECT', `${client.nickname} se desconectó`);
      clients.delete(ws);
      
      // Actualizar lista de usuarios para todos los clientes restantes
      broadcast('users', {
        count: clients.size,
        users: getConnectedUsers()
      });
    }
  });

  // Manejar errores
  ws.on('error', (err) => {
    const client = clients.get(ws);
    if (client) {
      logMessage('ERROR', `Error en ${client.nickname}: ${err.message}`);
      clients.delete(ws);
    }
  });

  // Ping periódico para mantener conexión viva
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  ws.on('close', () => {
    clearInterval(pingInterval);
  });
});

// Manejar errores del servidor
server.on('error', (err) => {
  logMessage('SERVER_ERROR', err.message);
  console.error('Error del servidor:', err);
});

// Iniciar servidor
server.listen(PORT, () => {
  logMessage('SERVER_START', `Servidor WebSocket iniciado en puerto ${PORT}`);
  console.log(`
🚀 Servidor WebSocket Chat iniciado
📡 Puerto: ${PORT}
🌐 Web: http://localhost:${PORT}
📁 Logs: ${LOG_FILE}
👥 Clientes conectados: ${clients.size}

Esperando conexiones...
  `);
});

// Manejo graceful de cierre
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  
  // Notificar a todos los clientes
  broadcast('system', { message: '🔴 El servidor se está cerrando. ¡Hasta luego!' });
  
  // Cerrar todas las conexiones
  clients.forEach((client, ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
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
export { server, wss, clients, broadcast, logMessage };

