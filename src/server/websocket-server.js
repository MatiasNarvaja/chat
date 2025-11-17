// Servidor WebSocket mejorado con múltiples clientes, broadcast y comandos
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  generateToken, 
  verifyToken, 
  registerUser, 
  authenticateUser, 
  getUserById,
  updateUserNickname 
} from './auth.js';
import { 
  deriveEncryptionKey, 
  encryptMessage, 
  decryptMessage, 
  isEncrypted 
} from './crypto.js';

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

// Middleware para parsear JSON
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, '../../public')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Endpoint de registro
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Usuario y contraseña son requeridos' 
      });
    }
    
    const user = registerUser(username, password, nickname);
    const token = generateToken(user);
    
    logMessage('REGISTER', `Nuevo usuario registrado: ${user.username}`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      }
    });
  } catch (error) {
    logMessage('REGISTER_ERROR', error.message);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint de login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Usuario y contraseña son requeridos' 
      });
    }
    
    const user = authenticateUser(username, password);
    const token = generateToken(user);
    
    logMessage('LOGIN', `Usuario autenticado: ${user.username}`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      }
    });
  } catch (error) {
    logMessage('LOGIN_ERROR', error.message);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para verificar token
app.post('/api/verify', (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token requerido' 
      });
    }
    
    const decoded = verifyToken(token);
    const user = getUserById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Usuario no encontrado' 
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
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
function sendJSON(ws, type, data, useEncryption = false) {
  if (ws.readyState === ws.OPEN) {
    const client = clients.get(ws);
    const baseMessage = { type, data, timestamp: new Date().toISOString() };
    
    if (useEncryption && client && client.encryptionKey) {
      try {
        const dataString = JSON.stringify(data);
        const encryptedData = encryptMessage(dataString, client.encryptionKey);
        const encryptedMessage = {
          type,
          data: encryptedData,
          encrypted: true,
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(encryptedMessage));
        return;
      } catch (error) {
        logMessage('SEND_ENCRYPT_ERROR', `Error cifrando mensaje: ${error.message}`);
        // Fallback: enviar sin cifrar
      }
    }
    
    ws.send(JSON.stringify(baseMessage));
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

// Función para broadcast cifrado a todos los clientes
function broadcastEncrypted(type, data, excludeWs = null, encryptionKey = null) {
  const baseMessage = { 
    type, 
    data, 
    timestamp: new Date().toISOString() 
  };
  
  const dataString = JSON.stringify(data);
  
  clients.forEach((client, ws) => {
    if (ws !== excludeWs && ws.readyState === ws.OPEN) {
      try {
        // Si el cliente tiene clave de cifrado, cifrar el mensaje
        if (client.encryptionKey) {
          const encryptedData = encryptMessage(dataString, client.encryptionKey);
          
          const encryptedMessage = {
            type,
            data: encryptedData,
            encrypted: true,
            timestamp: new Date().toISOString()
          };
          
          ws.send(JSON.stringify(encryptedMessage));
        } else {
          // Enviar sin cifrar si no hay clave
          ws.send(JSON.stringify(baseMessage));
        }
      } catch (error) {
        logMessage('BROADCAST_ERROR', `Error enviando mensaje a ${client.username}: ${error.message}`);
        // Fallback: enviar sin cifrar
        ws.send(JSON.stringify(baseMessage));
      }
    }
  });
}

// Función para enviar mensaje privado cifrado
function sendPrivateMessage(ws, data, encryptionKey) {
  if (ws.readyState === ws.OPEN) {
    try {
      const dataString = JSON.stringify(data);
      
      if (encryptionKey) {
        // Cifrar mensaje privado
        const encryptedData = encryptMessage(dataString, encryptionKey);
        
        const encryptedMessage = {
          type: 'private',
          data: encryptedData,
          encrypted: true,
          timestamp: new Date().toISOString()
        };
        
        ws.send(JSON.stringify(encryptedMessage));
      } else {
        // Enviar sin cifrar si no hay clave
        ws.send(JSON.stringify({ 
          type: 'private', 
          data, 
          timestamp: new Date().toISOString() 
        }));
      }
    } catch (error) {
      logMessage('PRIVATE_MESSAGE_ERROR', `Error enviando mensaje privado: ${error.message}`);
    }
  }
}

// Función para obtener lista de usuarios conectados
function getConnectedUsers() {
  return Array.from(clients.values())
    .map(client => client.nickname);
}

// Función para verificar el token de un cliente
function verifyClientToken(ws) {
  const client = clients.get(ws);
  if (!client || !client.token) {
    return false;
  }
  
  try {
    const decoded = verifyToken(client.token);
    const user = getUserById(decoded.id);
    
    if (!user) {
      return false;
    }
    
    // Actualizar nickname si cambió en la base de datos
    if (user.nickname !== client.nickname) {
      client.nickname = user.nickname;
    }
    
    return true;
  } catch (error) {
    logMessage('TOKEN_VERIFY_ERROR', `Token inválido para ${client.username}: ${error.message}`);
    return false;
  }
}

// Función para desloguear un cliente por token inválido
function logoutClient(ws, reason = 'Token inválido o expirado') {
  const client = clients.get(ws);
  if (client) {
    logMessage('LOGOUT', `${client.username} deslogueado: ${reason}`);
    sendJSON(ws, 'error', { message: `❌ ${reason}. Por favor, inicia sesión nuevamente.` });
    
    // Notificar a otros usuarios
    broadcast('system', { message: `🔴 ${client.nickname} se ha desconectado` }, ws);
    
    // Eliminar cliente del mapa
    clients.delete(ws);
    
    // Actualizar lista de usuarios para todos los clientes restantes
    broadcast('users', {
      count: clients.size,
      users: getConnectedUsers()
    });
  }
  ws.close(1008, reason);
}

// Función para procesar comandos
function processCommand(ws, message) {
  // Verificar token antes de procesar comandos
  if (!verifyClientToken(ws)) {
    logoutClient(ws, 'Token inválido o expirado');
    return true; // Retornar true para indicar que el comando fue "procesado" (rechazado)
  }
  
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
      
      // Actualizar nickname en la base de datos si el usuario está autenticado
      if (client.userId) {
        try {
          const updatedUser = updateUserNickname(client.userId, newNick);
          client.nickname = updatedUser.nickname;
        } catch (error) {
          sendJSON(ws, 'error', { message: `❌ Error al actualizar nickname: ${error.message}` });
          return true;
        }
      } else {
        client.nickname = newNick;
      }
      
      logMessage('NICK_CHANGE', `${oldNick} cambió su nick a ${client.nickname}`);
      broadcast('system', { message: `🔄 ${oldNick} ahora se llama ${client.nickname}` }, ws);
      sendJSON(ws, 'success', { message: `✅ Tu nickname ahora es: ${client.nickname}` });
      
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
  // Obtener token de la query string o headers
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');
  
  let user = null;
  let clientId = null;
  let nickname = null;
  
  // Verificar autenticación
  if (token) {
    try {
      const decoded = verifyToken(token);
      user = getUserById(decoded.id);
      
      if (user) {
        clientId = user.id;
        nickname = user.nickname;
      } else {
        sendJSON(ws, 'error', { message: '❌ Usuario no encontrado' });
        ws.close(1008, 'Usuario no encontrado');
        return;
      }
    } catch (error) {
      sendJSON(ws, 'error', { message: `❌ Error de autenticación: ${error.message}` });
      ws.close(1008, 'Token inválido');
      return;
    }
  } else {
    // Si no hay token, rechazar conexión
    sendJSON(ws, 'error', { message: '❌ Se requiere autenticación. Por favor, inicia sesión.' });
    ws.close(1008, 'Autenticación requerida');
    return;
  }
  
  // Obtener IP del cliente
  const ip = req.socket.remoteAddress || 'unknown';
  
  // Derivar clave de cifrado del token
  let encryptionKey = null;
  try {
    encryptionKey = deriveEncryptionKey(token);
  } catch (error) {
    logMessage('ENCRYPTION_ERROR', `Error derivando clave: ${error.message}`);
  }
  
  // Crear objeto cliente
  const client = {
    id: clientId,
    userId: user.id,
    username: user.username,
    nickname: nickname,
    ip: ip,
    token: token, // Guardar token para verificación posterior
    encryptionKey: encryptionKey, // Clave de cifrado derivada
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
      const rawData = data.toString().trim();
      
      if (!rawData) return; // Ignorar mensajes vacíos
      
      // Manejar pings para mantener conexión viva (formato antiguo)
      if (rawData === 'PING') {
        ws.send('PONG');
        return;
      }
      
      let messageToken = null;
      let messageContent = null;
      let messageType = 'message';
      let isEncryptedMessage = false;
      let parsed = null;
      
      // Intentar parsear como JSON (nuevo formato con token)
      try {
        parsed = JSON.parse(rawData);
        messageToken = parsed.token;
        messageContent = parsed.content;
        messageType = parsed.type || 'message';
        isEncryptedMessage = parsed.encrypted === true;
      } catch (e) {
        // Formato antiguo (solo texto) - mantener compatibilidad
        messageContent = rawData;
        parsed = null;
      }
      
      // Si el mensaje incluye token, verificar ese token
      if (messageToken) {
        try {
          const decoded = verifyToken(messageToken);
          const user = getUserById(decoded.id);
          
          if (!user) {
            logoutClient(ws, 'Token inválido o expirado');
            return;
          }
          
          // Actualizar token y datos del cliente si el token es válido
          const client = clients.get(ws);
          if (client) {
            client.token = messageToken;
            if (user.nickname !== client.nickname) {
              client.nickname = user.nickname;
            }
          }
        } catch (error) {
          logMessage('TOKEN_VERIFY_ERROR', `Token inválido en mensaje: ${error.message}`);
          logoutClient(ws, 'Token inválido o expirado');
          return;
        }
      } else {
        // Si no hay token en el mensaje, verificar el token almacenado del cliente
        if (!verifyClientToken(ws)) {
          logoutClient(ws, 'Token inválido o expirado');
          return;
        }
      }
      
      const client = clients.get(ws);
      if (!client) {
        return; // Cliente ya fue removido
      }
      
      if (!messageContent) return; // Ignorar mensajes vacíos
      
      // Manejar mensajes privados
      if (messageType === 'private') {
        if (!parsed || !parsed.target) {
          sendJSON(ws, 'error', { message: '❌ Debes especificar un destinatario' });
          return;
        }
        
        const targetUser = parsed.target;
        
        // Descifrar mensaje privado si está cifrado
        if (isEncryptedMessage && client.encryptionKey) {
          try {
            messageContent = decryptMessage(messageContent, client.encryptionKey);
          } catch (error) {
            logMessage('DECRYPT_ERROR', `Error descifrando mensaje privado de ${client.username}: ${error.message}`);
            sendJSON(ws, 'error', { message: '❌ Error al descifrar mensaje privado' });
            return;
          }
        }
        
        // Buscar el cliente destino por nickname
        let targetClient = null;
        clients.forEach((c, wsClient) => {
          if (c.nickname === targetUser && wsClient !== ws) {
            targetClient = { client: c, ws: wsClient };
          }
        });
        
        if (!targetClient) {
          sendJSON(ws, 'error', { message: `❌ Usuario ${targetUser} no está conectado` });
          return;
        }
        
        // Crear mensaje privado
        const privateMessage = {
          from: client.nickname,
          message: messageContent,
          timestamp: new Date().toISOString()
        };
        
        logMessage('PRIVATE_MESSAGE', `${client.nickname} -> ${targetUser}: ${messageContent}`);
        
        // Enviar mensaje privado cifrado al destinatario
        sendPrivateMessage(targetClient.ws, privateMessage, targetClient.client.encryptionKey);
        
        return;
      }
      
      // Descifrar mensaje si está cifrado
      if (isEncryptedMessage && client.encryptionKey) {
        try {
          messageContent = decryptMessage(messageContent, client.encryptionKey);
        } catch (error) {
          logMessage('DECRYPT_ERROR', `Error descifrando mensaje de ${client.username}: ${error.message}`);
          sendJSON(ws, 'error', { message: '❌ Error al descifrar mensaje' });
          return;
        }
      }
      
      // Procesar comandos
      if (messageContent.startsWith('/')) {
        const isCommand = processCommand(ws, messageContent);
        if (isCommand) {
          logMessage('COMMAND', `${client.nickname}: ${messageContent}`);
          return;
        }
      }
      
      // Procesar mensaje normal
      const chatMessage = {
        nickname: client.nickname,
        message: messageContent,
        timestamp: new Date().toISOString()
      };
      logMessage('MESSAGE', `${client.nickname}: ${messageContent}`);
      
      // Cifrar mensaje antes de broadcast
      broadcastEncrypted('message', chatMessage, ws, client.encryptionKey);
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

