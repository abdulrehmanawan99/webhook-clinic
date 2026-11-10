// Local runtime configuration. Imported first so `.env` is loaded before any
// other module reads process.env. Variables already exported in the shell win:
// Node's loadEnvFile never overwrites an existing value.
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

function port(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error(`${name} must be an integer port between 1024 and 65535.`);
  return value;
}

export const uiPort = port("CLINIC_UI_PORT", 5174);
export const apiPort = port("CLINIC_API_PORT", 8011);
export const receiverPort = port("CLINIC_RECEIVER_PORT", 9011);
export const mongoPort = port("CLINIC_MONGO_PORT", 27018);
export const redisPort = port("CLINIC_REDIS_PORT", 6381);

export const uiOrigin = `http://127.0.0.1:${uiPort}`;
export const apiBase = `http://127.0.0.1:${apiPort}`;
export const receiverBase = `http://127.0.0.1:${receiverPort}`;
export const mongoUrl =
  process.env.MONGO_URL || `mongodb://127.0.0.1:${mongoPort}`;
export const redisUrl =
  process.env.REDIS_URL || `redis://127.0.0.1:${redisPort}`;
