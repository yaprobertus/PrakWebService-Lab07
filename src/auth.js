import { randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'praktikum-web-service-week4';
const AUDIENCE = 'library-graphql-api';
const STATE_COOKIE = 'github_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;

export function getOAuthConfig() {
  const names = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'CALLBACK_URL', 'JWT_SECRET'];
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`OAuth belum dikonfigurasi: ${missing.join(', ')}`);

  const callbackUrl = new URL(process.env.CALLBACK_URL);
  if (callbackUrl.pathname !== '/auth/callback' ||
      (callbackUrl.protocol !== 'https:' && callbackUrl.hostname !== 'localhost')) {
    throw new Error('CALLBACK_URL harus menuju /auth/callback melalui HTTPS (atau localhost).');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET harus berisi minimal 32 karakter acak.');
  }

  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: callbackUrl.toString(),
    jwtSecret: process.env.JWT_SECRET,
  };
}

export function createOAuthState() {
  return randomBytes(32).toString('hex');
}

export function stateCookie(state, secure = true) {
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=${STATE_MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearStateCookie(secure = true) {
  return `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function isValidOAuthState(request, state) {
  const match = String(request.headers.cookie ?? '').match(/(?:^|;\s*)github_oauth_state=([^;]*)/);
  let stored = '';
  try { stored = match ? decodeURIComponent(match[1]) : ''; } catch { return false; }
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(stored)) return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(stored));
}

export function createAppToken(githubUser, secret) {
  return jwt.sign(
    { username: githubUser.login },
    secret,
    { algorithm: 'HS256', subject: String(githubUser.id), issuer: ISSUER, audience: AUDIENCE, expiresIn: '1h' },
  );
}

export function authenticatedUser(request) {
  const header = request?.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || !process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE,
    });
    if (typeof payload !== 'object' || typeof payload.username !== 'string' || !payload.sub) return null;
    return { id: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export function sendJson(response, status, data) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(data));
}
