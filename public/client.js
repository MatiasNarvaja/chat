// Cliente WebSocket para el chat
class ChatClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.isConnected = false;
        this.nickname = 'Usuario';
        this.pingInterval = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.connect();
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

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.nickModal.classList.contains('show')) {
                this.nickModal.classList.remove('show');
            }
        });
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
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

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                // Si no es JSON, puede ser un PONG
                if (event.data === 'PONG') {
                    return;
                }
                console.error('Error al parsear mensaje:', error);
            }
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            this.updateStatus(false, 'Desconectado');
            this.disableInput();
            this.stopPing();
            this.addSystemMessage('🔌 Desconectado del servidor');
            this.attemptReconnect();
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

        // Procesar comandos del cliente primero
        if (message.startsWith('/')) {
            if (message === '/clear') {
                this.messagesContainer.innerHTML = '';
                return;
            }
            // Enviar otros comandos al servidor
            this.sendCommand(message);
        } else {
            // Enviar mensaje normal
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(message);
                this.addMessage(this.nickname, message, new Date().toISOString(), 'user');
            }
        }

        this.messageInput.value = '';
    }

    sendCommand(command) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(command);
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

