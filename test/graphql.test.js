import assert from 'node:assert/strict';
import test from 'node:test';
import { createApolloServer } from '../src/apollo.js';
import { createRequestContext } from '../src/context.js';
import { createAppToken } from '../src/auth.js';

const authors = [
  { id: '1', name: 'Andrea Hirata', country: 'Indonesia' },
  { id: '2', name: 'Dee Lestari', country: 'Indonesia' },
];
const publishers = [{ id: '10', name: 'Bentang Pustaka', city: 'Yogyakarta' }];
const books = [
  { id: '20', title: 'Laskar Pelangi', isbn: '9789793062792', publication_year: 2005, author_id: '1', publisher_id: '10' },
  { id: '21', title: 'Supernova', isbn: '9786028811729', publication_year: 2001, author_id: '2', publisher_id: '10' },
];

class FakePool {
  async query(text, values = []) {
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql === 'SELECT * FROM authors ORDER BY id') return { rows: authors };
    if (sql === 'SELECT * FROM publishers ORDER BY id') return { rows: publishers };
    if (sql === 'SELECT * FROM books ORDER BY id') return { rows: books };
    if (sql.includes('FROM authors WHERE id = ANY')) {
      return { rows: authors.filter((row) => values[0].map(String).includes(row.id)) };
    }
    if (sql.includes('FROM publishers WHERE id = ANY')) {
      return { rows: publishers.filter((row) => values[0].map(String).includes(row.id)) };
    }
    if (sql.includes('FROM books WHERE author_id = ANY')) {
      return { rows: books.filter((row) => values[0].map(String).includes(row.author_id)) };
    }
    if (sql.includes('FROM books WHERE publisher_id = ANY')) {
      return { rows: books.filter((row) => values[0].map(String).includes(row.publisher_id)) };
    }
    if (sql.includes('FROM books WHERE author_id = $1')) {
      return { rows: books.filter((row) => row.author_id === String(values[0])) };
    }
    throw new Error(`FakePool belum menangani SQL: ${sql}`);
  }
}

async function execute(source, { demoNPlusOne = false, authorization } = {}) {
  const server = createApolloServer();
  const context = createRequestContext(new FakePool(), {
    headers: {
      ...(demoNPlusOne && { 'x-n-plus-one-demo': 'true' }),
      ...(authorization && { authorization }),
    },
  });
  const response = await server.executeOperation({ query: source }, { contextValue: context });
  await server.stop();
  assert.equal(response.body.kind, 'single');
  return response.body.singleResult;
}

test('nested query dua arah mengembalikan author, publisher, dan book', async () => {
  const result = await execute(`
    query IntegrationTest {
      authors { name books { title publicationYear publisher { name } } }
    }
  `);
  assert.equal(result.errors, undefined);
  assert.equal(result.data.authors.length, 2);
  assert.equal(result.data.authors[0].books[0].publisher.name, 'Bentang Pustaka');
  assert.deepEqual(result.extensions.resolverAudit, {
    operation: 'IntegrationTest',
    totalDatabaseQueries: 3,
    relationResolverCalls: 4,
    dataLoaderBatchQueries: 2,
    dataLoaderEnabled: true,
  });
});

test('mode demonstrasi membuktikan rumus 1 + N', async () => {
  const result = await execute(`query NPlusOne { authors { name books { title } } }`, {
    demoNPlusOne: true,
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.extensions.resolverAudit.relationResolverCalls, 2);
  assert.equal(result.extensions.resolverAudit.totalDatabaseQueries, 3);
  assert.equal(result.extensions.resolverAudit.dataLoaderEnabled, false);
});

test('validasi mutation menolak tahun publikasi di luar kontrak', async () => {
  process.env.JWT_SECRET = 'test-secret-longer-than-thirty-two-characters';
  const authorization = `Bearer ${createAppToken({ id: 123, login: 'penguji' }, process.env.JWT_SECRET)}`;
  const result = await execute(`
    mutation {
      createBook(input: {
        title: "Buku Uji", isbn: "9781234567890", publicationYear: 1200,
        authorId: "1", publisherId: "10"
      }) { id }
    }
  `, { authorization });
  assert.equal(result.errors[0].extensions.code, 'BAD_USER_INPUT');
});

test('introspection tetap aktif dan schema memiliki Query serta Mutation', async () => {
  const result = await execute(`
    query {
      __schema { queryType { name } mutationType { fields { name } } }
    }
  `);
  assert.equal(result.errors, undefined);
  assert.equal(result.data.__schema.queryType.name, 'Query');
  assert.equal(result.data.__schema.mutationType.fields.length, 9);
});
