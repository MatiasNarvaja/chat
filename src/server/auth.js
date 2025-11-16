// Módulo de autenticación con JWT
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const USERS_FILE = path.join(__dirname, '../../data/users.json');

// Asegurar que el directorio de datos existe
const dataDir = path.dirname(USERS_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Cargar usuarios desde archivo
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error cargando usuarios:', error);
  }
  return {};
}

// Guardar usuarios en archivo
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error guardando usuarios:', error);
    throw error;
  }
}

// Hash de contraseña usando SHA-256 (en producción usar bcrypt)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Verificar contraseña
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// Generar token JWT
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    nickname: user.nickname || user.username
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Verificar token JWT
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw error;
  }
}

// Registrar nuevo usuario
export function registerUser(username, password, nickname) {
  const users = loadUsers();
  
  // Validaciones
  if (!username || username.trim().length < 3) {
    throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
  }
  
  if (!password || password.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres');
  }
  
  if (users[username]) {
    throw new Error('El nombre de usuario ya existe');
  }
  
  // Crear nuevo usuario
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newUser = {
    id: userId,
    username: username.trim().toLowerCase(),
    password: hashPassword(password),
    nickname: (nickname || username).trim(),
    createdAt: new Date().toISOString()
  };
  
  users[username.trim().toLowerCase()] = newUser;
  saveUsers(users);
  
  return {
    id: newUser.id,
    username: newUser.username,
    nickname: newUser.nickname
  };
}

// Autenticar usuario (login)
export function authenticateUser(username, password) {
  const users = loadUsers();
  const user = users[username.trim().toLowerCase()];
  
  if (!user) {
    throw new Error('Usuario o contraseña incorrectos');
  }
  
  if (!verifyPassword(password, user.password)) {
    throw new Error('Usuario o contraseña incorrectos');
  }
  
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname
  };
}

// Obtener usuario por ID
export function getUserById(userId) {
  const users = loadUsers();
  for (const username in users) {
    if (users[username].id === userId) {
      const user = users[username];
      return {
        id: user.id,
        username: user.username,
        nickname: user.nickname
      };
    }
  }
  return null;
}

// Actualizar nickname de usuario
export function updateUserNickname(userId, newNickname) {
  const users = loadUsers();
  for (const username in users) {
    if (users[username].id === userId) {
      users[username].nickname = newNickname.trim();
      saveUsers(users);
      return {
        id: users[username].id,
        username: users[username].username,
        nickname: users[username].nickname
      };
    }
  }
  throw new Error('Usuario no encontrado');
}

