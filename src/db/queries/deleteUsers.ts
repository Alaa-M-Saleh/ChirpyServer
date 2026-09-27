import { db } from "../index.js";
import { users } from "../schema.js";

export async function deleteAllUsers() {
  await db.delete(users);
}
