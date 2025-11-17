// Módulo de cifrado para el cliente (Web Crypto API)
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits para GCM
const TAG_LENGTH = 128; // bits

// Derivar clave de cifrado desde el token JWT
export async function deriveEncryptionKey(token) {
  try {
    // Convertir token a ArrayBuffer
    const tokenBuffer = new TextEncoder().encode(token);
    
    // Crear hash del token para usar como salt
    const saltBuffer = await crypto.subtle.digest('SHA-256', tokenBuffer);
    
    // Importar el token como clave base
    const baseKey = await crypto.subtle.importKey(
      'raw',
      tokenBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derivar clave usando PBKDF2
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: ALGORITHM,
        length: KEY_LENGTH
      },
      false,
      ['encrypt', 'decrypt']
    );
    
    return derivedKey;
  } catch (error) {
    throw new Error(`Error al derivar clave: ${error.message}`);
  }
}

// Cifrar mensaje
export async function encryptMessage(message, key) {
  try {
    // Generar IV aleatorio
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Convertir mensaje a ArrayBuffer
    const messageBuffer = new TextEncoder().encode(message);
    
    // Cifrar mensaje
    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH
      },
      key,
      messageBuffer
    );
    
    // En AES-GCM, el tag está al final del ArrayBuffer cifrado
    // Separar el tag (últimos 16 bytes) del ciphertext
    const tagLengthBytes = TAG_LENGTH / 8; // 16 bytes
    const ciphertextLength = encrypted.byteLength - tagLengthBytes;
    const ciphertext = new Uint8Array(encrypted, 0, ciphertextLength);
    const tag = new Uint8Array(encrypted, ciphertextLength, tagLengthBytes);
    
    // Combinar IV + tag + ciphertext (formato compatible con Node.js)
    const combined = new Uint8Array(iv.length + tag.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(tag, iv.length);
    combined.set(ciphertext, iv.length + tag.length);
    
    // Convertir a base64
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    throw new Error(`Error al cifrar mensaje: ${error.message}`);
  }
}

// Descifrar mensaje
export async function decryptMessage(encryptedData, key) {
  try {
    // Decodificar de base64
    const combined = Uint8Array.from(
      atob(encryptedData),
      c => c.charCodeAt(0)
    );
    
    // Extraer IV, tag y ciphertext (formato: IV + TAG + CIPHERTEXT)
    const iv = combined.slice(0, IV_LENGTH);
    const tagLengthBytes = TAG_LENGTH / 8; // 16 bytes
    const tag = combined.slice(IV_LENGTH, IV_LENGTH + tagLengthBytes);
    const ciphertext = combined.slice(IV_LENGTH + tagLengthBytes);
    
    // Combinar ciphertext + tag para Web Crypto API
    const encrypted = new Uint8Array(ciphertext.length + tag.length);
    encrypted.set(ciphertext, 0);
    encrypted.set(tag, ciphertext.length);
    
    // Descifrar mensaje
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH
      },
      key,
      encrypted
    );
    
    // Convertir a string
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Error al descifrar mensaje: ${error.message}`);
  }
}

// Verificar si un string está cifrado (base64 válido)
export function isEncrypted(data) {
  try {
    const decoded = atob(data);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    // Verificar que tenga el tamaño mínimo (IV)
    return bytes.length >= IV_LENGTH;
  } catch {
    return false;
  }
}

