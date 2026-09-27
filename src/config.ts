import process from "node:process";
import type { MigrationConfig } from "drizzle-orm/migrator";

process.loadEnvFile();

export function envOrThrow(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Environment variable ${key} is required but missing`);
  }

  return value;
}

export type APIConfig = {
  fileserverHits: number;
  port: number;
  platform: string;
  polkaKey: string;
};

export type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};

export type JWTConfig = {
  secret: string;
};

const dbUrl = envOrThrow("DB_URL");
const jwtSecret = envOrThrow("JWT_SECRET");

export const config = {
  api: {
    fileserverHits: 0,
    port: Number(envOrThrow("PORT")),
    platform: envOrThrow("PLATFORM"),
    polkaKey: envOrThrow("POLKA_KEY"),
  },

  db: {
    url: dbUrl,
    migrationConfig: {
      migrationsFolder: "./src/db/migrations",
    },
  },

  jwt: {
    secret: jwtSecret,
  },
};
