import { asc, eq } from "drizzle-orm";
import { db } from "../index.js";
import { chirps, NewChirp } from "../schema.js";

export async function createChirp(chirp: NewChirp) {
  const [result] = await db.insert(chirps).values(chirp).returning();

  return result;
}

export async function getAllChirps(authorId: string = "") {
  if (authorId) {
    return await db
      .select()
      .from(chirps)
      .where(eq(chirps.userId, authorId))
      .orderBy(asc(chirps.createdAt));
  }

  return await db.select().from(chirps).orderBy(asc(chirps.createdAt));
}

export async function getChirpById(id: string) {
  const [chirp] = await db.select().from(chirps).where(eq(chirps.id, id));

  return chirp;
}

export async function deleteChirp(id: string) {
  const [chirp] = await db.delete(chirps).where(eq(chirps.id, id)).returning();

  return chirp;
}
