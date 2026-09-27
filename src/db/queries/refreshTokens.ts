import { db } from "../index.js";
import { eq } from "drizzle-orm";
import { refreshTokens, NewRefreshToken } from "../schema.js";

export async function createRefreshToken(token: NewRefreshToken) {
  const [result] = await db.insert(refreshTokens).values(token).returning();

  return result;
}

export async function getRefreshToken(token: string) {
  const [result] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, token));

  return result;
}

export async function revokeRefreshToken(token: string) {
  await db
    .update(refreshTokens)
    .set({
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(refreshTokens.token, token));
}

export async function getUserFromRefreshToken(token: string) {
  const [result] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, token));

  return result;
}
