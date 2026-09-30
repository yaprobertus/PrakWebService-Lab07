import assert from 'node:assert/strict';
import test from 'node:test';
import { createApolloServer } from '../src/apollo.js';
import { createAppToken, isValidOAuthState } from '../src/auth.js';
import { createRequestContext } from '../src/context.js';
import { resolvers } from '../src/schema/resolvers.js';
import loginHandler from '../api/auth/login.js';
import callbackHandler from '../api/auth/callback.js';

const secret = 'test-secret-longer-than-thirty-two-characters';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.CALLBACK_URL = 'http://localhost:3000/auth/callback';
process.env.JWT_SECRET = secret;

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; },
  };
}

test('login mengarahkan ke GitHub dengan state dan cookie terikat callback', () => {
  const res = response();
  loginHandler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 302);
  const url = new URL(res.headers.location);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'test-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), process.env.CALLBACK_URL);
  const state = url.searchParams.get('state');
  assert.match(state, /^[a-f0-9]{64}$/);
  assert.match(res.headers['set-cookie'], /HttpOnly; SameSite=Lax; Path=\/auth\/callback/);
  assert.equal(isValidOAuthState({ headers: { cookie: res.headers['set-cookie'] } }, state), true);
});

test('callback menukar code, membaca profil, dan memberi JWT aplikasi satu jam', async () => {
  const loginRes = response();
  loginHandler({ method: 'GET' }, loginRes);
  const state = new URL(loginRes.headers.location).searchParams.get('state');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: true, json: async () => ({ access_token: 'provider-secret-token' }) };
    return { ok: true, json: async () => ({ id: 42, login: 'robertus' }) };
  };
  try {
    const res = response();
    await callbackHandler({
      method: 'GET',
      headers: { cookie: loginRes.headers['set-cookie'] },
      query: { code: 'one-time-code', state },
    }, res);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.username, 'robertus');
    assert.equal(data.expiresIn, 3600);
    assert.equal(data.tokenType, 'Bearer');
    assert.equal(data.token.includes('provider-secret-token'), false);
    assert.equal(calls[0].url, 'https://github.com/login/oauth/access_token');
    assert.equal(JSON.parse(calls[0].options.body).code, 'one-time-code');
    assert.equal(calls[1].url, 'https://api.github.com/user');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer provider-secret-token');
    assert.equal(createRequestContext({ query() {} }, { headers: { authorization: `Bearer ${data.token}` } }).user.username, 'robertus');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callback menolak state yang hilang tanpa menghubungi GitHub', async () => {
  const res = response();
  await callbackHandler({ method: 'GET', headers: {}, query: { code: 'one-time-code', state: 'wrong' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /state OAuth tidak valid/);
});

test('seluruh mutation menolak tanpa JWT; createBook berhasil dengan JWT valid', async () => {
  assert.equal(Object.keys(resolvers.Mutation).length, 9);
  for (const resolver of Object.values(resolvers.Mutation)) {
    assert.throws(() => resolver(null, {}, {}), (error) => error.extensions.code === 'UNAUTHENTICATED');
  }
  let writes = 0;
  const pool = {
    async query(sql, values) {
      writes += 1;
      assert.match(sql, /INSERT INTO books/);
      return { rows: [{
        id: '99', title: values[0], isbn: values[1], publication_year: values[2],
        author_id: String(values[3]), publisher_id: String(values[4]),
      }] };
    },
  };
  const server = createApolloServer();
  const mutation = `mutation CreateBookLab07 {
    createBook(input: {title:"Buku OAuth",isbn:"9786021409206",publicationYear:2026,authorId:"1",publisherId:"1"}) { id title }
  }`;
  try {
    const anonymous = createRequestContext(pool, { headers: {} });
    const denied = await server.executeOperation({ query: mutation }, { contextValue: anonymous });
    assert.equal(denied.body.singleResult.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal(writes, 0);

    const token = createAppToken({ id: 42, login: 'robertus' }, secret);
    const authorized = createRequestContext(pool, { headers: { authorization: `Bearer ${token}` } });
    const accepted = await server.executeOperation({ query: mutation }, { contextValue: authorized });
    assert.equal(accepted.body.singleResult.errors, undefined);
    assert.equal(accepted.body.singleResult.data.createBook.id, '99');
    assert.equal(writes, 1);

    const invalid = createRequestContext(pool, { headers: { authorization: 'Bearer invalid-token' } });
    assert.equal(invalid.user, null);
  } finally {
    await server.stop();
  }
});
