import { beforeAll, describe, expect, it } from "vitest";

import { makeJWT, validateJWT, getBearerToken } from "./auth.js";

import type { Request } from "express";

describe("JWT", () => {
  const userID = "123e4567-e89b-12d3-a456-426614174000";

  const secret = "super-secret-key";

  let token: string;

  beforeAll(() => {
    token = makeJWT(userID, 3600, secret);
  });

  it("should validate a valid token", () => {
    const result = validateJWT(token, secret);

    expect(result).toBe(userID);
  });

  it("should reject tokens signed with wrong secret", () => {
    expect(() => validateJWT(token, "wrong-secret")).toThrow();
  });

  it("should reject expired tokens", () => {
    const expiredToken = makeJWT(userID, -1, secret);

    expect(() => validateJWT(expiredToken, secret)).toThrow();
  });
});

describe("Bearer Tokens", () => {
  it("should extract token", () => {
    const req = {
      get: () => "Bearer my-token",
    } as unknown as Request;

    expect(getBearerToken(req)).toBe("my-token");
  });
});
