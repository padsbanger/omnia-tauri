//! Bitwarden encrypted-string v2 interoperability using RustCrypto primitives.
//! Protocol references and supported subset are documented in docs/vaultwarden.md.
use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

type Result<T> = std::result::Result<T, String>;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kdf {
    #[serde(alias = "Kdf")]
    pub kdf: u32,
    #[serde(alias = "KdfIterations")]
    pub kdf_iterations: u32,
    #[serde(alias = "KdfMemory")]
    pub kdf_memory: Option<u32>,
    #[serde(alias = "KdfParallelism")]
    pub kdf_parallelism: Option<u32>,
}
pub fn derive(password: &str, email: &str, kdf: &Kdf) -> Result<Zeroizing<[u8; 32]>> {
    let mut key = Zeroizing::new([0; 32]);
    let salt = email.trim().to_lowercase();
    match kdf.kdf {
        0 if (5_000..=2_000_000).contains(&kdf.kdf_iterations) => {
            pbkdf2::pbkdf2_hmac::<Sha256>(
                password.as_bytes(),
                salt.as_bytes(),
                kdf.kdf_iterations,
                key.as_mut(),
            );
        }
        1 => {
            let memory = kdf.kdf_memory.ok_or("Missing Argon2 memory")?;
            let parallel = kdf.kdf_parallelism.ok_or("Missing Argon2 parallelism")?;
            if !(16..=256).contains(&memory)
                || !(2..=10).contains(&kdf.kdf_iterations)
                || !(1..=16).contains(&parallel)
            {
                return Err("Vault KDF exceeds supported resource limits".into());
            }
            let params = argon2::Params::new(memory * 1024, kdf.kdf_iterations, parallel, Some(32))
                .map_err(|_| "Invalid vault KDF")?;
            argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params)
                .hash_password_into(
                    password.as_bytes(),
                    &Sha256::digest(salt.as_bytes()),
                    key.as_mut(),
                )
                .map_err(|_| "Vault key derivation failed")?;
        }
        _ => return Err("Unsupported vault KDF or iteration count".into()),
    }
    Ok(key)
}
pub fn password_hash(key: &[u8], password: &str) -> Zeroizing<String> {
    let mut hash = Zeroizing::new([0; 32]);
    pbkdf2::pbkdf2_hmac::<Sha256>(key, password.as_bytes(), 1, hash.as_mut());
    Zeroizing::new(STANDARD.encode(*hash))
}
pub fn stretch(key: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    let hk = hkdf::Hkdf::<Sha256>::from_prk(key).map_err(|_| "Invalid master key")?;
    let mut out = Zeroizing::new(vec![0; 64]);
    hk.expand(b"enc", &mut out[..32])
        .map_err(|_| "Invalid master key")?;
    hk.expand(b"mac", &mut out[32..])
        .map_err(|_| "Invalid master key")?;
    Ok(out)
}
pub fn decrypt(value: &str, key: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    if key.len() != 64 || value.len() > 1_048_576 {
        return Err("Unsupported vault key or field size".into());
    }
    let fields: Vec<_> = value
        .strip_prefix("2.")
        .ok_or("Unsupported encrypted field version")?
        .split('|')
        .collect();
    if fields.len() != 3 {
        return Err("Malformed encrypted field".into());
    }
    let decode = |v| {
        STANDARD
            .decode(v)
            .map_err(|_| "Malformed encrypted field".to_string())
    };
    let iv = decode(fields[0])?;
    let mut data = Zeroizing::new(decode(fields[1])?);
    let tag = decode(fields[2])?;
    let mut mac =
        <Hmac<Sha256> as Mac>::new_from_slice(&key[32..]).map_err(|_| "Invalid vault key")?;
    mac.update(&iv);
    mac.update(&data);
    mac.verify_slice(&tag)
        .map_err(|_| "Vault integrity verification failed")?;
    let len = cbc::Decryptor::<aes::Aes256>::new_from_slices(&key[..32], &iv)
        .map_err(|_| "Invalid vault IV")?
        .decrypt_padded_mut::<Pkcs7>(&mut data)
        .map_err(|_| "Vault decryption failed")?
        .len();
    data.truncate(len);
    Ok(data)
}
pub fn text(value: Option<&str>, key: &[u8]) -> Result<Zeroizing<String>> {
    let Some(value) = value else {
        return Ok(Zeroizing::new(String::new()));
    };
    let bytes = decrypt(value, key)?;
    let text = std::str::from_utf8(&bytes).map_err(|_| "Invalid vault text")?;
    Ok(Zeroizing::new(text.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upstream_password_hash_vectors() {
        // Published interoperability vectors, not credentials.
        let kdf = Kdf {
            kdf: 0,
            kdf_iterations: 100_000,
            kdf_memory: None,
            kdf_parallelism: None,
        };
        let key = derive("asdfasdf", " TEST@bitwarden.com ", &kdf).unwrap();
        assert_eq!(
            &*password_hash(&*key, "asdfasdf"),
            "wmyadRMyBZOH7P/a/ucTCbSghKgdzDpPqUnu/DAVtSw="
        );
        let kdf = Kdf {
            kdf: 1,
            kdf_iterations: 4,
            kdf_memory: Some(32),
            kdf_parallelism: Some(2),
        };
        let key = derive("asdfasdf", "test_salt", &kdf).unwrap();
        assert_eq!(
            &*password_hash(&*key, "asdfasdf"),
            "PR6UjYmjmppTYcdyTiNbAhPJuQQOmynKbdEl1oyi/iQ="
        );
    }
    #[test]
    fn rejects_unbounded_kdf_and_unauthenticated_fields() {
        let kdf = Kdf {
            kdf: 1,
            kdf_iterations: 4,
            kdf_memory: Some(u32::MAX),
            kdf_parallelism: Some(2),
        };
        assert!(derive("test", "test", &kdf).is_err());
        assert!(decrypt("0.bad|bad", &[0; 64]).is_err());
        assert!(decrypt("2.AAAA|AAAA|AAAA", &[0; 64]).is_err());
    }
}
