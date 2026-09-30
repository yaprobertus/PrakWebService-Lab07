import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvers } from '../src/schema/resolvers.js';

class Lab05Pool {
  constructor() {
    this.books = [];
    this.nextId = 1;
  }

  async query(text, values = []) {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('INSERT INTO books')) {
      const row = {
        id: String(this.nextId++),
        title: values[0],
        isbn: values[1],
        publication_year: values[2],
        author_id: String(values[3]),
        publisher_id: String(values[4]),
      };
      this.books.push(row);
      return { rows: [row] };
    }

    if (sql.startsWith('UPDATE books SET')) {
      assert.equal(sql.includes('updated_at'), false, 'resolver tidak boleh bergantung pada kolom legacy yang belum ada');
      const id = String(values.at(-1));
      const row = this.books.find((book) => book.id === id);
      if (!row) return { rows: [] };
      const assignments = sql.match(/^UPDATE books SET (.+) WHERE id/)[1].split(', ');
      assignments.forEach((assignment, index) => {
        const field = assignment.split(' = ')[0];
        row[field] = values[index];
      });
      return { rows: [row] };
    }

    if (sql.startsWith('DELETE FROM books')) {
      const index = this.books.findIndex((book) => book.id === String(values[0]));
      if (index < 0) return { rows: [] };
      const [deleted] = this.books.splice(index, 1);
      return { rows: [{ id: deleted.id }] };
    }

    if (sql.startsWith('SELECT * FROM books')) {
      let rows = [...this.books];
      let valueIndex = 0;
      if (sql.includes('author_id =')) rows = rows.filter((row) => row.author_id === String(values[valueIndex++]));
      if (sql.includes('publisher_id =')) rows = rows.filter((row) => row.publisher_id === String(values[valueIndex++]));
      if (sql.includes('title ILIKE')) {
        const search = String(values[valueIndex]).replaceAll('%', '').toLowerCase();
        rows = rows.filter((row) => row.title.toLowerCase().includes(search));
      }
      return { rows };
    }

    throw new Error(`SQL Lab 05 belum ditangani: ${sql}`);
  }
}

function context(pool) {
  return {
    pool,
    user: { id: '123', username: 'penguji' },
    metrics: {
      databaseQueryCount: 0,
      relationResolverCallCount: 0,
      dataLoaderBatchQueryCount: 0,
    },
  };
}

test('alur Lab 05 create-filter-update-filter-delete-filter benar-benar mengubah data', async () => {
  const pool = new Lab05Pool();
  const ctx = context(pool);

  const created = await resolvers.Mutation.createBook(null, {
    input: {
      title: 'Buku Uji Lab 05',
      isbn: '9786021409206',
      publicationYear: 2026,
      authorId: '1',
      publisherId: '1',
    },
  }, ctx);
  assert.equal(created.title, 'Buku Uji Lab 05');

  const afterCreate = await resolvers.Query.books(null, {
    authorId: '1',
    publisherId: '1',
    search: 'Buku Uji Lab 05',
  }, ctx);
  assert.equal(afterCreate.length, 1);

  const updated = await resolvers.Mutation.updateBook(null, {
    id: created.id,
    input: { title: 'Buku Uji Lab 05 Diperbarui', publicationYear: 2025 },
  }, ctx);
  assert.equal(updated.title, 'Buku Uji Lab 05 Diperbarui');
  assert.equal(updated.publication_year, 2025);

  const afterUpdate = await resolvers.Query.books(null, { search: 'Diperbarui' }, ctx);
  assert.equal(afterUpdate.length, 1);

  assert.equal(await resolvers.Mutation.deleteBook(null, { id: created.id }, ctx), true);
  assert.deepEqual(await resolvers.Query.books(null, { search: 'Diperbarui' }, ctx), []);
  assert.equal(ctx.metrics.databaseQueryCount, 6);
});
