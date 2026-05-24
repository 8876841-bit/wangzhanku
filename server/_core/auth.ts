/**
 * Simple password-based authentication
 * Replaces Manus OAuth with a single admin password stored in env
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

const JWT_ALG = "HS256";

function getJwtSecret(): Uint8Array {
  const secret = ENV.cookieSecret || ENV.jwtSecret;
  if (!secret) throw new Error("JWT_SECRET env var is required");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(openId: string): Promise<string> {
  return new SignJWT({ openId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return (payload.openId as string) ?? null;
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request) {
  const raw = req.cookies?.[COOKIE_NAME] ?? req.headers?.cookie;
  if (!raw) return null;

  // parse cookie manually if needed
  let token: string | undefined;
  if (req.cookies?.[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  } else {
    const match = String(raw).match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    token = match?.[1];
  }
  if (!token) return null;

  const openId = await verifySessionToken(token);
  if (!openId) return null;

  return db.getUserByOpenId(openId);
}

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/login  { password: string }
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { password } = req.body ?? {};
    const adminPassword = ENV.adminPassword;

    if (!adminPassword) {
      res.status(500).json({ error: "ADMIN_PASSWORD not configured on server" });
      return;
    }

    if (!password || password !== adminPassword) {
      res.status(401).json({ error: "密码错误" });
      return;
    }

    // Upsert the single admin user
    const ADMIN_OPEN_ID = "admin";
    await db.upsertUser({
      openId: ADMIN_OPEN_ID,
      name: "Admin",
      email: null,
      loginMethod: "password",
      lastSignedIn: new Date(),
    });

    const sessionToken = await createSessionToken(ADMIN_OPEN_ID);
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });

    res.json({ success: true });
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}
