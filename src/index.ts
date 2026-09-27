import express from "express";
import { Request, Response, NextFunction } from "express";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "./config.js";
import {
  createUser,
  getUserByEmail,
  updateUser,
  upgradeUserToChirpyRed,
} from "./db/queries/users.js";
import { deleteAllUsers } from "./db/queries/deleteUsers.js";
import {
  createChirp,
  getAllChirps,
  getChirpById,
  deleteChirp,
} from "./db/queries/chirps.js";
import {
  hashPassword,
  checkPasswordHash,
  makeJWT,
  validateJWT,
  getBearerToken,
  makeRefreshToken,
  getAPIKey,
} from "./auth.js";
import {
  createRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
} from "./db/queries/refreshTokens.js";

const migrationClient = postgres(config.db.url, { max: 1 });

await migrate(drizzle(migrationClient), config.db.migrationConfig);

const app = express();

type CreateUserRequest = {
  email: string;
  password: string;
};

type LoginRequest = {
  email: string;
  password: string;
  expiresInSeconds?: number;
};

type ChirpRequest = {
  body: string;
};

type ChirpParams = {
  chirpId: string;
};

type UpdateUserRequest = {
  email: string;
  password: string;
};

type PolkaWebhookRequest = {
  event: string;
  data?: {
    userId?: string;
  };
};

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

const middlewareLogResponses = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.on("finish", () => {
    if (res.statusCode >= 400 && res.statusCode < 600) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`,
      );
    }
  });
  next();
};
function middlewareMetricsInc(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  config.api.fileserverHits++;
  console.log("hits =", config.api.fileserverHits);
  next();
}

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: err.message });
  } else if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
  } else if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
  } else {
    console.error(err);
    res.status(500).json({
      error: "Something went wrong on our end",
    });
  }
}
app.use(errorHandler);

const handlerReadiness = (req: Request, res: Response): void => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
};

const handlerReqCount = (req: Request, res: Response): void => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>`);
};

const handlerResetReqCount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (config.api.platform !== "dev") {
    throw new ForbiddenError(
      "Reset endpoint only available in dev environment",
    );
  }

  config.api.fileserverHits = 0;

  await deleteAllUsers();

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
};

async function handlerCreateChirp(req: Request, res: Response): Promise<void> {
  const params: ChirpRequest = req.body;

  let userId: string;

  try {
    const token = getBearerToken(req);

    userId = validateJWT(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid token");
  }

  if (typeof params.body !== "string" || params.body.length > 140) {
    throw new BadRequestError("Chirp is too long. Max length is 140");
  }

  const words = params.body.split(" ");

  for (let i = 0; i < words.length; i++) {
    const lower = words[i].toLowerCase();

    if (lower === "kerfuffle" || lower === "sharbert" || lower === "fornax") {
      words[i] = "****";
    }
  }

  const cleanedBody = words.join(" ");

  const chirp = await createChirp({
    body: cleanedBody,
    userId,
  });

  res.status(201).json({
    id: chirp.id,
    createdAt: chirp.createdAt,
    updatedAt: chirp.updatedAt,
    body: chirp.body,
    userId: chirp.userId,
  });
}

async function handlerGetChirps(req: Request, res: Response): Promise<void> {
  let authorId = "";
  const authorIdQuery = req.query.authorId;

  if (typeof authorIdQuery === "string") {
    authorId = authorIdQuery;
  }

  let sort = "asc";
  const sortQuery = req.query.sort;

  if (typeof sortQuery === "string") {
    sort = sortQuery;
  }

  const chirps = await getAllChirps(authorId);

  chirps.sort((a, b) => {
    if (sort === "desc") {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  res.status(200).json(chirps);
}

async function handlerGetChirp(
  req: Request<ChirpParams>,
  res: Response,
): Promise<void> {
  const chirpId = req.params.chirpId;

  const chirp = await getChirpById(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  res.status(200).json(chirp);
}

async function handlerCreateUser(req: Request, res: Response): Promise<void> {
  const params: CreateUserRequest = req.body;

  const hashedPassword = await hashPassword(params.password);

  const user = await createUser({
    email: params.email,
    hashedPassword,
  });

  res.status(201).json({
    id: user.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    email: user.email,
    isChirpyRed: user.isChirpyRed,
  });
}

async function handlerLogin(req: Request, res: Response): Promise<void> {
  const params: LoginRequest = req.body;

  const user = await getUserByEmail(params.email);

  if (!user) {
    throw new UnauthorizedError("incorrect email or password");
  }

  const passwordMatch = await checkPasswordHash(
    params.password,
    user.hashedPassword,
  );

  if (!passwordMatch) {
    throw new UnauthorizedError("incorrect email or password");
  }

  const maxExpiration = 60 * 60;

  const expiresInSeconds = Math.min(
    params.expiresInSeconds ?? maxExpiration,
    maxExpiration,
  );

  const accessToken = makeJWT(user.id, expiresInSeconds, config.jwt.secret);

  const refreshToken = makeRefreshToken();

  await createRefreshToken({
    token: refreshToken,
    userId: user.id,

    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),

    revokedAt: null,
  });

  res.status(200).json({
    id: user.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    email: user.email,
    isChirpyRed: user.isChirpyRed,
    token: accessToken,
    refreshToken,
  });
}

async function handlerRefresh(req: Request, res: Response): Promise<void> {
  const token = getBearerToken(req);

  const refreshToken = await getRefreshToken(token);

  if (!refreshToken) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (refreshToken.revokedAt) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (refreshToken.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const accessToken = makeJWT(refreshToken.userId, 60 * 60, config.jwt.secret);

  res.status(200).json({
    token: accessToken,
  });
}

async function handlerRevoke(req: Request, res: Response): Promise<void> {
  const token = getBearerToken(req);

  await revokeRefreshToken(token);

  res.status(204).send();
}

async function handlerUpdateUser(req: Request, res: Response): Promise<void> {
  const token = getBearerToken(req);

  const userId = validateJWT(token, config.jwt.secret);

  const params: UpdateUserRequest = req.body;

  const hashedPassword = await hashPassword(params.password);

  const user = await updateUser(userId, params.email, hashedPassword);

  res.status(200).json({
    id: user.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    email: user.email,
    isChirpyRed: user.isChirpyRed,
  });
}

async function handlerDeleteChirp(req: Request, res: Response): Promise<void> {
  const token = getBearerToken(req);

  const userId = validateJWT(token, config.jwt.secret);

  const chirpId = req.params.chirpId;

  if (typeof chirpId !== "string") {
    throw new NotFoundError("Chirp not found");
  }

  const chirp = await getChirpById(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  if (chirp.userId !== userId) {
    throw new ForbiddenError("You cannot delete this chirp");
  }

  await deleteChirp(chirpId);

  res.status(204).send();
}

async function handlerPolkaWebhook(req: Request, res: Response): Promise<void> {
  const apiKey = getAPIKey(req);

  if (apiKey !== config.api.polkaKey) {
    res.status(401).send();
    return;
  }

  const { event, data } = req.body;

  if (event !== "user.upgraded") {
    res.status(204).send();
    return;
  }

  const user = await upgradeUserToChirpyRed(data.userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(204).send();
}

app.use(express.json());
app.use("/app", middlewareMetricsInc);
app.use("/app", express.static("./src/app"));
app.use(middlewareLogResponses);

app.get("/admin/metrics", handlerReqCount);
app.post("/admin/reset", handlerResetReqCount);

app.get("/api/healthz", handlerReadiness);
app.post("/api/users", handlerCreateUser);
app.post("/api/login", handlerLogin);
app.post("/api/refresh", handlerRefresh);
app.post("/api/revoke", handlerRevoke);
app.put("/api/users", handlerUpdateUser);

app.post("/api/chirps", handlerCreateChirp);
app.get("/api/chirps", handlerGetChirps);
app.get("/api/chirps/:chirpId", handlerGetChirp);
app.delete("/api/chirps/:chirpId", handlerDeleteChirp);

app.post("/api/polka/webhooks", handlerPolkaWebhook);

app.use(errorHandler);

app.listen(config.api.port, () => {
  console.log(`app listening on port ${config.api.port}`);
});
