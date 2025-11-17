// Módulo de cifrado para mensajes
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits para GCM
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

// Derivar clave de cifrado desde el token JWT
export function deriveEncryptionKey(token) {
  // Usar el token como salt para derivar una clave determinista
  const salt = crypto.createHash('sha256').update(token).digest();
  
  // Derivar clave usando PBKDF2
  const key = crypto.pbkdf2Sync(
    token,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
  
  return key;
}

// Cifrar mensaje
export function encryptMessage(message, key) {
  try {
    // Generar IV aleatorio
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Crear cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Cifrar mensaje
    let encrypted = cipher.update(message, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Obtener tag de autenticación
    const tag = cipher.getAuthTag();
    
    // Combinar IV + tag + datos cifrados
    const result = Buffer.concat([iv, tag, encrypted]);
    
    // Retornar en base64
    return result.toString('base64');
  } catch (error) {
    throw new Error(`Error al cifrar mensaje: ${error.message}`);
  }
}

// Descifrar mensaje
export function decryptMessage(encryptedData, key) {
  try {
    // Decodificar de base64
    const data = Buffer.from(encryptedData, 'base64');
    
    // Extraer IV, tag y datos cifrados
    const iv = data.slice(0, IV_LENGTH);
    const tag = data.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.slice(IV_LENGTH + TAG_LENGTH);
    
    // Crear decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Descifrar mensaje
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Error al descifrar mensaje: ${error.message}`);
  }
}

// Verificar si un string está cifrado (base64 válido)
export function isEncrypted(data) {
  try {
    // Intentar decodificar base64
    const decoded = Buffer.from(data, 'base64');
    // Verificar que tenga el tamaño mínimo (IV + TAG)
    return decoded.length >= (IV_LENGTH + TAG_LENGTH);
  } catch {
    return false;
  }
}

