// Cliente TCP interactivo mejorado para el chat
import net from 'net';
import readline from 'readline';
import chalk from 'chalk';

// Configuración
const PORT = process.env.PORT_TCP || 7000;
const HOST = process.env.HOST || 'localhost';

// Variables globales
let socket = null;
let rl = null;
let isConnected = false;
let nickname = 'Usuario';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Configurar readline con colores
function createReadlineInterface() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('💬 ')
  });
}

// Función para conectar al servidor
function connectToServer() {
  return new Promise((resolve, reject) => {
    console.log(chalk.yellow(`🔄 Conectando a ${HOST}:${PORT}...`));
    
    socket = net.createConnection({ 
      port: PORT, 
      host: HOST
      // Removido timeout para evitar desconexiones prematuras
    }, () => {
      isConnected = true;
      reconnectAttempts = 0;
      console.log(chalk.green('✅ Conectado al servidor'));
      console.log(chalk.blue('💡 Escribe /help para ver comandos disponibles'));
      resolve();
    });

    socket.setEncoding('utf8');
    
    // Configurar timeout de inactividad (30 segundos sin datos)
    socket.setTimeout(30000);

    // Manejar datos recibidos
    socket.on('data', (data) => {
      // Resetear timeout cuando recibimos datos
      socket.setTimeout(30000);
      
      const message = data.toString().trim();
      if (message) {
        // Detectar tipo de mensaje por emojis para colorear
        if (message.includes('🟢') || message.includes('se ha conectado')) {
          console.log(chalk.green(message));
        } else if (message.includes('🔴') || message.includes('desconectado')) {
          console.log(chalk.red(message));
        } else if (message.includes('🔄') || message.includes('ahora se llama')) {
          console.log(chalk.yellow(message));
        } else if (message.includes('👥') || message.includes('Usuarios conectados')) {
          console.log(chalk.blue(message));
        } else if (message.includes('📋') || message.includes('Comandos disponibles')) {
          console.log(chalk.magenta(message));
        } else if (message.includes('✅') || message.includes('Tu nickname')) {
          console.log(chalk.green(message));
        } else if (message.includes('❌')) {
          console.log(chalk.red(message));
        } else {
          console.log(chalk.white(message));
        }
      }
    });

    // Manejar desconexión
    socket.on('end', () => {
      isConnected = false;
      console.log(chalk.red('🔌 Conexión cerrada por el servidor'));
      attemptReconnect();
    });

    // Manejar errores
    socket.on('error', (err) => {
      isConnected = false;
      console.log(chalk.red(`❌ Error de conexión: ${err.message}`));
      reject(err);
    });

    // Timeout de inactividad (no de conexión)
    socket.on('timeout', () => {
      console.log(chalk.yellow('⏰ Timeout de inactividad - enviando ping...'));
      // Enviar un ping para mantener la conexión viva
      if (socket && !socket.destroyed) {
        socket.write('PING\n');
      }
    });

    // Timeout de conexión manual (10 segundos)
    const connectionTimeout = setTimeout(() => {
      if (!isConnected) {
        console.log(chalk.red('⏰ Timeout de conexión (10s)'));
        socket.destroy();
        reject(new Error('Connection timeout'));
      }
    }, 10000);

    // Limpiar timeout cuando se conecta
    socket.on('connect', () => {
      clearTimeout(connectionTimeout);
    });
  });
}

// Función para reconectar automáticamente
function attemptReconnect() {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(chalk.yellow(`🔄 Intentando reconectar... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`));
    
    setTimeout(async () => {
      try {
        await connectToServer();
        console.log(chalk.green('✅ Reconectado exitosamente'));
      } catch (err) {
        attemptReconnect();
      }
    }, 2000);
  } else {
    console.log(chalk.red('❌ Máximo número de intentos de reconexión alcanzado'));
    console.log(chalk.yellow('💡 Presiona Ctrl+C para salir'));
  }
}

// Función para procesar comandos del cliente
function processClientCommand(input) {
  const parts = input.split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/help':
    case '/ayuda':
      console.log(chalk.magenta(`
📋 Comandos disponibles:
/nick <nombre>  - Cambiar tu nickname
/lista          - Ver usuarios conectados  
/salir          - Salir del chat
/help           - Mostrar esta ayuda
/clear          - Limpiar pantalla
      `));
      return true;

    case '/clear':
      console.clear();
      console.log(chalk.blue('🧹 Pantalla limpiada'));
      return true;

    case '/salir':
    case '/quit':
    case '/exit':
      console.log(chalk.yellow('👋 Cerrando conexión...'));
      if (socket && isConnected) {
        socket.end();
      }
      rl.close();
      process.exit(0);
      return true;

    default:
      return false; // No es un comando del cliente
  }
}

// Función para enviar mensaje
function sendMessage(message) {
  if (!isConnected || !socket) {
    console.log(chalk.red('❌ No estás conectado al servidor'));
    return;
  }

  try {
    socket.write(message + '\n');
  } catch (err) {
    console.log(chalk.red(`❌ Error al enviar mensaje: ${err.message}`));
  }
}

// Función principal
async function startClient() {
  console.log(chalk.blue(`
🎉 Cliente TCP Chat
==================
Conectando a ${HOST}:${PORT}...
  `));

  try {
    await connectToServer();
    
    // Crear interfaz readline
    createReadlineInterface();
    
    // Manejar entrada del usuario
    rl.on('line', (input) => {
      const trimmedInput = input.trim();
      
      if (!trimmedInput) return; // Ignorar líneas vacías
      
      // Procesar comandos del cliente primero
      if (trimmedInput.startsWith('/')) {
        const isClientCommand = processClientCommand(trimmedInput);
        if (!isClientCommand) {
          // Si no es comando del cliente, enviarlo al servidor
          sendMessage(trimmedInput);
        }
      } else {
        // Enviar mensaje normal
        sendMessage(trimmedInput);
      }
    });

    // Manejar Ctrl+C
    rl.on('SIGINT', () => {
      console.log(chalk.yellow('\n👋 Cerrando cliente...'));
      if (socket && isConnected) {
        socket.end();
      }
      rl.close();
      process.exit(0);
    });

    // Mostrar prompt
    rl.prompt();

  } catch (err) {
    console.log(chalk.red(`❌ Error al conectar: ${err.message}`));
    console.log(chalk.yellow('💡 Verifica que el servidor esté ejecutándose'));
    process.exit(1);
  }
}

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
  console.log(chalk.red(`❌ Error no manejado: ${err.message}`));
  if (socket) socket.destroy();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(chalk.red(`❌ Promesa rechazada: ${reason}`));
});

// Iniciar cliente
startClient();
