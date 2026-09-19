/// 加密前缀标记，用于检测字符串是否已加密
const ENCRYPTED_PREFIX: &str = "TMENC:";

/// 派生 XOR 密钥（基于可执行文件路径，简单但比无密钥好）
fn derive_key() -> Vec<u8> {
    let seed = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "TokenMeter-fallback".to_string());
    
    // 用种子生成 32 字节密钥
    let mut key = Vec::with_capacity(32);
    for i in 0..32 {
        let byte = seed.bytes().nth(i % seed.len()).unwrap_or(0) ^ (i as u8).wrapping_add(0x5A);
        key.push(byte);
    }
    key
}

/// XOR 加密/解密（对称操作）
fn xor_crypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .zip(key.iter().cycle())
        .map(|(d, k)| d ^ k)
        .collect()
}

/// 简单 hex 编码（无外部依赖）
fn hex_encode(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02x}", b)).collect()
}

/// 简单 hex 解码
fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("无效的 hex 字符串".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("hex 解码失败: {}", e)))
        .collect()
}

/// 检测字符串是否已加密
pub fn is_encrypted(s: &str) -> bool {
    s.starts_with(ENCRYPTED_PREFIX)
}

/// 加密 API Key
pub fn encrypt_api_key(plaintext: &str) -> String {
    if plaintext.is_empty() || is_encrypted(plaintext) {
        return plaintext.to_string();
    }
    
    let key = derive_key();
    let encrypted = xor_crypt(plaintext.as_bytes(), &key);
    let encoded = hex_encode(&encrypted);
    format!("{}{}", ENCRYPTED_PREFIX, encoded)
}

/// 解密 API Key
pub fn decrypt_api_key(cipher: &str) -> Result<String, String> {
    if cipher.is_empty() || !is_encrypted(cipher) {
        // 未加密，直接返回（向后兼容）
        return Ok(cipher.to_string());
    }
    
    let encoded = cipher.strip_prefix(ENCRYPTED_PREFIX)
        .ok_or("无效的加密格式")?;
    
    let encrypted = hex_decode(encoded)?;
    let key = derive_key();
    let plaintext = xor_crypt(&encrypted, &key);
    
    String::from_utf8(plaintext)
        .map_err(|e| format!("UTF-8 解码失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "tp-cmf4jaz9xe3his0eggq4ojc08mhv6nrmu08839yo1qksgcna";
        let encrypted = encrypt_api_key(original);
        let decrypted = decrypt_api_key(&encrypted).unwrap();
        assert_eq!(original, decrypted);
        assert!(is_encrypted(&encrypted));
    }
    
    #[test]
    fn test_plaintext_passthrough() {
        let plaintext = "plain-key";
        let result = decrypt_api_key(plaintext).unwrap();
        assert_eq!(plaintext, result);
    }
}
