import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const keyVersion = "v1";
export const DEMO_LOST_ITEM_PRIVATE_DATA_KEY = "ZmljdGlvbmFsLWxvc3QtaXRlbS1wcml2YXRlLWtleSE=";

function invalid(message, status = 500) {
  throw Object.assign(new Error(message), { status });
}

export function createLostItemCipher(encodedKey) {
  const input = String(encodedKey || "").trim();
  let key;
  try { key = Buffer.from(input, "base64"); } catch { invalid("Lost-Item private-data encryption key is invalid.", 503); }
  if (!input || key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== input.replace(/=+$/, "")) {
    invalid("Lost-Item private-data encryption key must be a base64-encoded 32-byte key.", 503);
  }

  return Object.freeze({
    encrypt(value, associatedData) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(associatedData));
      const plaintext = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value), "utf8");
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return { keyVersion, nonce, ciphertext, authenticationTag: cipher.getAuthTag() };
    },
    decrypt(record, associatedData, { json = false } = {}) {
      if (record.keyVersion !== keyVersion && record.key_version !== keyVersion) invalid("Lost-Item encrypted data uses an unsupported key version.");
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.nonce));
        decipher.setAAD(Buffer.from(associatedData));
        decipher.setAuthTag(Buffer.from(record.authenticationTag || record.authentication_tag));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext)), decipher.final()]);
        return json ? JSON.parse(plaintext.toString("utf8")) : plaintext;
      } catch {
        invalid("Lost-Item encrypted data failed authentication.");
      }
    },
  });
}
