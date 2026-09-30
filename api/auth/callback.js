import {
  clearStateCookie, createAppToken, getOAuthConfig, isValidOAuthState, sendJson,
} from '../../src/auth.js';

export default async function callbackHandler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Gunakan GET untuk callback.' });
  }

  let config;
  try {
    config = getOAuthConfig();
  } catch (error) {
    return sendJson(response, 503, { error: error.message });
  }

  response.setHeader('Set-Cookie', clearStateCookie(new URL(config.callbackUrl).protocol === 'https:'));
  const { code, state, error } = request.query ?? {};
  if (error) return sendJson(response, 400, { error: 'Login GitHub dibatalkan atau ditolak.' });
  if (typeof code !== 'string' || !code || typeof state !== 'string' ||
      !isValidOAuthState(request, state)) {
    return sendJson(response, 400, { error: 'Code atau state OAuth tidak valid. Mulai lagi dari /auth/login.' });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      return sendJson(response, 400, { error: 'Authorization code ditolak GitHub. Mulai lagi dari /auth/login.' });
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'praktikum-web-service-week4',
      },
      signal: AbortSignal.timeout(10000),
    });
    const githubUser = await userResponse.json();
    if (!userResponse.ok || !githubUser.id || typeof githubUser.login !== 'string') {
      return sendJson(response, 502, { error: 'Profil pengguna GitHub tidak dapat dibaca.' });
    }

    return sendJson(response, 200, {
      token: createAppToken(githubUser, config.jwtSecret),
      tokenType: 'Bearer',
      expiresIn: 3600,
      username: githubUser.login,
    });
  } catch {
    return sendJson(response, 502, { error: 'Komunikasi dengan GitHub gagal. Coba login ulang.' });
  }
}
