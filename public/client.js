// Cliente WebSocket para el chat
import { 
    deriveEncryptionKey, 
    encryptMessage, 
    decryptMessage, 
    isEncrypted 
} from './crypto-client.js';

class ChatClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.isConnected = false;
        this.nickname = 'Usuario';
        this.token = null;
        this.user = null;
        this.pingInterval = null;
        this.encryptionKey = null; // Clave de cifrado derivada del token
        
        this.initializeElements();
        this.attachEventListeners();
        this.checkAuth();
    }

    initializeElements() {
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.messagesContainer = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.currentNickname = document.getElementById('currentNickname');
        this.changeNickBtn = document.getElementById('changeNickBtn');
        this.usersList = document.getElementById('usersList');
        this.usersCount = document.getElementById('usersCount');
        this.nickModal = document.getElementById('nickModal');
        this.nickInput = document.getElementById('nickInput');
        this.saveNickBtn = document.getElementById('saveNickBtn');
        this.cancelNickBtn = document.getElementById('cancelNickBtn');
        
        // Elementos de autenticación
        this.authModal = document.getElementById('authModal');
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.loginUsername = document.getElementById('loginUsername');
        this.loginPassword = document.getElementById('loginPassword');
        this.loginBtn = document.getElementById('loginBtn');
        this.loginError = document.getElementById('loginError');
        this.registerUsername = document.getElementById('registerUsername');
        this.registerPassword = document.getElementById('registerPassword');
        this.registerNickname = document.getElementById('registerNickname');
        this.registerBtn = document.getElementById('registerBtn');
        this.registerError = document.getElementById('registerError');
        this.authTabs = document.querySelectorAll('.auth-tab');
        this.logoutBtn = document.getElementById('logoutBtn');
    }

    attachEventListeners() {
        // Enviar mensaje
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Cambiar nickname
        this.changeNickBtn.addEventListener('click', () => {
            this.nickModal.classList.add('show');
            this.nickInput.value = this.nickname;
            this.nickInput.focus();
        });

        this.saveNickBtn.addEventListener('click', () => {
            const newNick = this.nickInput.value.trim();
            if (newNick && newNick.length <= 20) {
                this.sendCommand(`/nick ${newNick}`);
                this.nickModal.classList.remove('show');
            } else {
                alert('El nickname debe tener entre 1 y 20 caracteres');
            }
        });

        this.cancelNickBtn.addEventListener('click', () => {
            this.nickModal.classList.remove('show');
        });

        // Autenticación - Tabs
        this.authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchAuthTab(tabName);
            });
        });

        // Login
        this.loginBtn.addEventListener('click', () => this.handleLogin());
        this.loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleLogin();
            }
        });

        // Registro
        this.registerBtn.addEventListener('click', () => this.handleRegister());
        this.registerPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleRegister();
            }
        });

        // Cerrar sesión
        this.logoutBtn.addEventListener('click', () => this.handleLogout());

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.nickModal.classList.contains('show')) {
                    this.nickModal.classList.remove('show');
                }
            }
        });
    }

    checkAuth() {
        // Verificar si hay un token guardado
        const savedToken = localStorage.getItem('chat_token');
        if (savedToken) {
            // Verificar si el token es válido
            this.verifyToken(savedToken);
        } else {
            // Mostrar modal de autenticación
            this.showAuthModal();
        }
    }

    async verifyToken(token) {
        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });

            const data = await response.json();
            
            if (data.success) {
                this.token = token;
                this.user = data.user;
                this.nickname = data.user.nickname;
                // Derivar clave de cifrado
                await this.initializeEncryption();
                this.hideAuthModal();
                this.connect();
            } else {
                localStorage.removeItem('chat_token');
                this.showAuthModal();
            }
        } catch (error) {
            console.error('Error verificando token:', error);
            localStorage.removeItem('chat_token');
            this.showAuthModal();
        }
    }

    async initializeEncryption() {
        if (this.token) {
            try {
                this.encryptionKey = await deriveEncryptionKey(this.token);
            } catch (error) {
                console.error('Error inicializando cifrado:', error);
            }
        }
    }

    async handleLogin() {
        const username = this.loginUsername.value.trim();
        const password = this.loginPassword.value;

        if (!username || !password) {
            this.loginError.textContent = 'Por favor, completa todos los campos';
            return;
        }

        this.loginError.textContent = '';
        this.loginBtn.disabled = true;
        this.loginBtn.textContent = 'Iniciando sesión...';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;
                this.nickname = data.user.nickname;
                localStorage.setItem('chat_token', data.token);
                // Derivar clave de cifrado
                await this.initializeEncryption();
                this.hideAuthModal();
                this.connect();
            } else {
                this.loginError.textContent = data.error || 'Error al iniciar sesión';
            }
        } catch (error) {
            console.error('Error en login:', error);
            this.loginError.textContent = 'Error de conexión. Intenta nuevamente.';
        } finally {
            this.loginBtn.disabled = false;
            this.loginBtn.textContent = 'Iniciar Sesión';
        }
    }

    async handleRegister() {
        const username = this.registerUsername.value.trim();
        const password = this.registerPassword.value;
        const nickname = this.registerNickname.value.trim();

        if (!username || !password) {
            this.registerError.textContent = 'Usuario y contraseña son requeridos';
            return;
        }

        this.registerError.textContent = '';
        this.registerBtn.disabled = true;
        this.registerBtn.textContent = 'Registrando...';

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, nickname: nickname || null })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;
                this.nickname = data.user.nickname;
                localStorage.setItem('chat_token', data.token);
                // Derivar clave de cifrado
                await this.initializeEncryption();
                this.hideAuthModal();
                this.connect();
            } else {
                this.registerError.textContent = data.error || 'Error al registrarse';
            }
        } catch (error) {
            console.error('Error en registro:', error);
            this.registerError.textContent = 'Error de conexión. Intenta nuevamente.';
        } finally {
            this.registerBtn.disabled = false;
            this.registerBtn.textContent = 'Registrarse';
        }
    }

    switchAuthTab(tabName) {
        this.authTabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        if (tabName === 'login') {
            this.loginForm.classList.add('active');
            this.registerForm.classList.remove('active');
            this.loginError.textContent = '';
        } else {
            this.registerForm.classList.add('active');
            this.loginForm.classList.remove('active');
            this.registerError.textContent = '';
        }
    }

    showAuthModal() {
        this.authModal.classList.add('show');
    }

    hideAuthModal() {
        this.authModal.classList.remove('show');
    }

    handleListCommand() {
        // Obtener lista de usuarios del sidebar
        const usersList = Array.from(this.usersList.children).map(item => item.textContent);
        const usersCount = this.usersCount.textContent;
        
        // Mostrar lista local inmediatamente
        if (usersList.length === 0) {
            this.addSystemMessage('👥 No hay usuarios conectados');
        } else {
            const message = `👥 ${usersCount}: ${usersList.join(', ')}`;
            this.addSystemMessage(message);
        }
        
        // También solicitar actualización al servidor para asegurar que tenemos la lista más reciente
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendCommand('/lista');
        }
    }

    handleLogout() {
        // Confirmar cierre de sesión
        if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
            // Limpiar token y datos de usuario
            localStorage.removeItem('chat_token');
            this.token = null;
            this.user = null;
            this.nickname = 'Usuario';
            this.encryptionKey = null;
            
            // Cerrar conexión WebSocket
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, 'Usuario cerró sesión');
            }
            
            // Limpiar mensajes
            this.messagesContainer.innerHTML = '';
            
            // Mostrar mensaje y modal de autenticación
            this.addSystemMessage('👋 Sesión cerrada. Hasta luego!');
            this.updateStatus(false, 'Desconectado');
            this.disableInput();
            
            setTimeout(() => {
                this.showAuthModal();
            }, 500);
        }
    }

    connect() {
        if (!this.token) {
            this.showAuthModal();
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?token=${encodeURIComponent(this.token)}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
        } catch (error) {
            console.error('Error al conectar:', error);
            this.updateStatus(false, 'Error de conexión');
            this.attemptReconnect();
        }
    }

    setupWebSocketHandlers() {
        this.ws.onopen = () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateStatus(true, 'Conectado');
            this.enableInput();
            this.startPing();
            this.addSystemMessage('✅ Conectado al servidor');
        };

        this.ws.onmessage = async (event) => {
            try {
                // Si es un PONG, no procesar
                if (event.data === 'PONG') {
                    return;
                }
                
                const data = JSON.parse(event.data);
                
                // Si el mensaje está cifrado, descifrarlo
                if (data.encrypted && data.data && typeof data.data === 'string') {
                    if (!this.encryptionKey) {
                        await this.initializeEncryption();
                    }
                    
                    try {
                        // Descifrar el contenido
                        const decrypted = await decryptMessage(data.data, this.encryptionKey);
                        // Reemplazar el contenido cifrado con el descifrado
                        data.data = JSON.parse(decrypted);
                    } catch (error) {
                        console.error('Error al descifrar mensaje:', error);
                        // Si falla el descifrado, intentar procesar sin descifrar
                        // pero marcar como error
                        data.type = 'error';
                        data.data = { message: '❌ Error al descifrar mensaje' };
                    }
                }
                
                this.handleMessage(data);
            } catch (error) {
                console.error('Error al parsear mensaje:', error);
            }
        };

        this.ws.onclose = (event) => {
            this.isConnected = false;
            this.updateStatus(false, 'Desconectado');
            this.disableInput();
            this.stopPing();
            
            // Si el cierre fue por autenticación, mostrar modal de login
            if (event.code === 1008) {
                this.addSystemMessage('🔌 Desconectado: ' + event.reason);
                localStorage.removeItem('chat_token');
                this.token = null;
                this.user = null;
                setTimeout(() => {
                    this.showAuthModal();
                }, 1000);
            } else {
                this.addSystemMessage('🔌 Desconectado del servidor');
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('Error WebSocket:', error);
            this.updateStatus(false, 'Error de conexión');
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                this.nickname = data.data.nickname;
                this.currentNickname.textContent = this.nickname;
                this.addSystemMessage(data.data.message);
                if (data.data.usersCount) {
                    this.usersCount.textContent = `${data.data.usersCount} usuarios`;
                }
                break;

            case 'message':
                this.addMessage(data.data.nickname, data.data.message, data.data.timestamp, 'other');
                break;

            case 'system':
                this.addSystemMessage(data.data.message);
                break;

            case 'error':
                this.addErrorMessage(data.data.message);
                break;

            case 'success':
                if (data.data.message.includes('nickname')) {
                    const match = data.data.message.match(/es: (.+)/);
                    if (match) {
                        this.nickname = match[1];
                        this.currentNickname.textContent = this.nickname;
                    }
                }
                this.addSystemMessage(data.data.message);
                break;

            case 'users':
                this.updateUsersList(data.data.users || []);
                if (data.data.count !== undefined) {
                    this.usersCount.textContent = `${data.data.count} usuarios`;
                }
                break;

            case 'help':
                let helpText = data.data.message + '\n';
                if (data.data.commands) {
                    helpText += data.data.commands.join('\n');
                }
                this.addSystemMessage(helpText);
                break;
        }
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.isConnected) return;

        // Verificar que el token exista en localStorage antes de enviar
        const storedToken = localStorage.getItem('chat_token');
        if (!storedToken || storedToken !== this.token) {
            this.addErrorMessage('❌ Sesión expirada. Por favor, inicia sesión nuevamente.');
            this.token = null;
            this.user = null;
            if (this.ws) {
                this.ws.close();
            }
            setTimeout(() => {
                this.showAuthModal();
            }, 1000);
            return;
        }

        // Procesar comandos del cliente primero
        if (message.startsWith('/')) {
            const command = message.toLowerCase().trim();
            
            // Comando /clear - Limpiar mensajes
            if (command === '/clear') {
                this.messagesContainer.innerHTML = '';
                return;
            }
            
            // Comando /lista, /list, /users - Mostrar lista de usuarios
            if (command === '/lista' || command === '/list' || command === '/users') {
                this.handleListCommand();
                return;
            }
            
            // Comando /salir, /quit, /exit - Cerrar sesión
            if (command === '/salir' || command === '/quit' || command === '/exit') {
                this.handleLogout();
                return;
            }
            
            // Enviar otros comandos al servidor
            this.sendCommand(message);
        } else {
            // Enviar mensaje normal con token y cifrado
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendEncryptedMessage(message);
            }
        }

        this.messageInput.value = '';
    }

    sendCommand(command) {
        // Verificar que el token exista en localStorage antes de enviar
        const storedToken = localStorage.getItem('chat_token');
        if (!storedToken || storedToken !== this.token) {
            this.addErrorMessage('❌ Sesión expirada. Por favor, inicia sesión nuevamente.');
            this.token = null;
            this.user = null;
            if (this.ws) {
                this.ws.close();
            }
            setTimeout(() => {
                this.showAuthModal();
            }, 1000);
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendEncryptedMessage(command, 'command');
        }
    }

    async sendEncryptedMessage(content, type = 'message') {
        try {
            if (!this.encryptionKey) {
                await this.initializeEncryption();
            }

            // Cifrar el contenido del mensaje
            const encryptedContent = await encryptMessage(content, this.encryptionKey);
            
            const messageData = {
                type: type,
                token: this.token,
                encrypted: true,
                content: encryptedContent
            };
            
            this.ws.send(JSON.stringify(messageData));
            
            // Solo mostrar el mensaje si es un mensaje normal (no comando)
            if (type === 'message') {
                this.addMessage(this.nickname, content, new Date().toISOString(), 'user');
            }
        } catch (error) {
            console.error('Error al cifrar y enviar mensaje:', error);
            this.addErrorMessage('❌ Error al enviar mensaje cifrado');
        }
    }

    addMessage(nickname, message, timestamp, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const time = new Date(timestamp).toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-nickname">${this.escapeHtml(nickname)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">${this.formatMessage(message)}</div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addSystemMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.innerHTML = `<div class="message-content">${this.formatMessage(message)}</div>`;
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addErrorMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message error';
        messageDiv.innerHTML = `<div class="message-content">${this.formatMessage(message)}</div>`;
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    formatMessage(message) {
        // Primero escapar HTML para seguridad
        let escaped = this.escapeHtml(message);
        
        // Convertir URLs a enlaces (después de escapar)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        escaped = escaped.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Preservar saltos de línea
        escaped = escaped.replace(/\n/g, '<br>');
        
        return escaped;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateUsersList(users) {
        this.usersList.innerHTML = '';
        users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item';
            userDiv.textContent = user;
            this.usersList.appendChild(userDiv);
        });
    }

    updateStatus(connected, text) {
        this.statusText.textContent = text;
        if (connected) {
            this.statusIndicator.classList.add('connected');
        } else {
            this.statusIndicator.classList.remove('connected');
        }
    }

    enableInput() {
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
        this.messageInput.focus();
    }

    disableInput() {
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('PING');
            }
        }, 30000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    attemptReconnect() {
        if (!this.token) {
            this.showAuthModal();
            return;
        }
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.addSystemMessage(`🔄 Intentando reconectar... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        } else {
            this.addSystemMessage('❌ Máximo número de intentos de reconexión alcanzado');
        }
    }
}

// Inicializar cliente cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    new ChatClient();
});

