import { createOAuthState, getOAuthConfig, sendJson, stateCookie } from '../../src/auth.js';

export default function loginHandler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Gunakan GET untuk login.' });
  }

  let config;
  try {
    config = getOAuthConfig();
  } catch (error) {
    return sendJson(response, 503, { error: error.message });
  }

  const state = createOAuthState();
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl);
  authorizeUrl.searchParams.set('scope', 'read:user');
  authorizeUrl.searchParams.set('state', state);

  response.statusCode = 302;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Set-Cookie', stateCookie(state, new URL(config.callbackUrl).protocol === 'https:'));
  response.setHeader('Location', authorizeUrl.toString());
  response.end();
}
