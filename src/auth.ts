import argon2 from "argon2";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Request } from "express";
import crypto from "node:crypto";
import { UnauthorizedError } from "./index.js";

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password);
}

export async function checkPasswordHash(
  password: string,
  hash: string,
): Promise<boolean> {
  return await argon2.verify(hash, password);
}

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);

  const payload: Pick<JwtPayload, "iss" | "sub" | "iat" | "exp"> = {
    iss: "chirpy",
    sub: userID,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  };

  return jwt.sign(payload, secret);
}

export function validateJWT(tokenString: string, secret: string): string {
  try {
    const decoded = jwt.verify(tokenString, secret) as JwtPayload;

    if (!decoded.sub || typeof decoded.sub !== "string") {
      throw new Error("Invalid token");
    }

    return decoded.sub;
  } catch {
    throw new UnauthorizedError("Invalid token");
  }
}

export function getBearerToken(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader) {
    throw new UnauthorizedError("Missing Authorization header");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Invalid Authorization header");
  }

  return token;
}
export function getAPIKey(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader) {
    return "";
  }

  const [scheme, key] = authHeader.split(" ");

  if (scheme !== "ApiKey" || !key) {
    return "";
  }

  return key;
}
export function makeRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
