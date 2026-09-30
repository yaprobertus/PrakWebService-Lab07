import { GraphQLError } from 'graphql';

const MUTABLE_FIELDS = {
  authors: ['name', 'country'],
  publishers: ['name', 'city'],
  books: ['title', 'isbn', 'publication_year', 'author_id', 'publisher_id'],
};

function badInput(message, field) {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', field } });
}

function nonBlank(value, field, minimum = 2) {
  if (typeof value !== 'string' || value.trim().length < minimum) {
    throw badInput(`${field} minimal ${minimum} karakter.`, field);
  }
  return value.trim();
}

function toSnakeCase(input) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value,
  ]));
}

function validateBook(input, partial = false) {
  const checked = { ...input };
  if (!partial || input.title !== undefined) checked.title = nonBlank(input.title, 'title');
  if (!partial || input.isbn !== undefined) {
    checked.isbn = nonBlank(input.isbn, 'isbn', 10);
    if (!/^[0-9Xx-]{10,20}$/.test(checked.isbn)) {
      throw badInput('isbn hanya boleh berisi angka, X, atau tanda hubung (10–20 karakter).', 'isbn');
    }
  }
  if (
    (!partial || input.publicationYear !== undefined) &&
    (!Number.isInteger(input.publicationYear) || input.publicationYear < 1450 || input.publicationYear > 2100)
  ) {
    throw badInput('publicationYear harus berupa tahun 1450–2100.', 'publicationYear');
  }
  return checked;
}

async function query(context, text, values = []) {
  context.metrics.databaseQueryCount += 1;
  return context.pool.query(text, values);
}

function databaseError(error) {
  if (error instanceof GraphQLError) return error;
  const known = {
    '23503': 'Data relasi tidak ditemukan atau data induk masih dipakai oleh buku.',
    '23505': 'ISBN tersebut sudah digunakan.',
    '23514': 'Data melanggar aturan validasi database.',
    '22P02': 'Format ID tidak valid.',
  };
  return new GraphQLError(known[error.code] ?? 'Operasi database gagal.', {
    extensions: { code: known[error.code] ? 'BAD_USER_INPUT' : 'INTERNAL_SERVER_ERROR' },
  });
}

async function findOne(context, table, id, label) {
  try {
    const result = await query(context, `SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!result.rows[0]) {
      throw new GraphQLError(`${label} dengan ID ${id} tidak ditemukan.`, {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    return result.rows[0];
  } catch (error) {
    throw databaseError(error);
  }
}

async function updateOne(context, table, id, input, label) {
  const normalized = toSnakeCase(input);
  const entries = Object.entries(normalized).filter(
    ([field, value]) => MUTABLE_FIELDS[table].includes(field) && value !== undefined,
  );
  if (!entries.length) throw badInput('Berikan minimal satu field untuk diperbarui.');
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([field], index) => `${field} = $${index + 1}`);
  values.push(id);
  try {
    const result = await query(
      context,
      `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!result.rows[0]) {
      throw new GraphQLError(`${label} dengan ID ${id} tidak ditemukan.`, {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    return result.rows[0];
  } catch (error) {
    throw databaseError(error);
  }
}

async function deleteOne(context, table, id, label) {
  try {
    const result = await query(context, `DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) {
      throw new GraphQLError(`${label} dengan ID ${id} tidak ditemukan.`, {
        extensions: { code: 'NOT_FOUND' },
      });
    }
    return true;
  } catch (error) {
    throw databaseError(error);
  }
}

const baseResolvers = {
  Author: {
    books: async (parent, _args, context) => {
      context.metrics.relationResolverCallCount += 1;
      if (context.useDataLoader) return context.loaders.booksByAuthorId.load(parent.id);
      return (await query(context, 'SELECT * FROM books WHERE author_id = $1 ORDER BY id', [parent.id])).rows;
    },
  },
  Publisher: {
    books: async (parent, _args, context) => {
      context.metrics.relationResolverCallCount += 1;
      if (context.useDataLoader) return context.loaders.booksByPublisherId.load(parent.id);
      return (await query(context, 'SELECT * FROM books WHERE publisher_id = $1 ORDER BY id', [parent.id])).rows;
    },
  },
  Book: {
    publicationYear: (parent) => parent.publication_year,
    author: async (parent, _args, context) => {
      context.metrics.relationResolverCallCount += 1;
      if (context.useDataLoader) return context.loaders.authorById.load(parent.author_id);
      return findOne(context, 'authors', parent.author_id, 'Penulis');
    },
    publisher: async (parent, _args, context) => {
      context.metrics.relationResolverCallCount += 1;
      if (context.useDataLoader) return context.loaders.publisherById.load(parent.publisher_id);
      return findOne(context, 'publishers', parent.publisher_id, 'Penerbit');
    },
  },
  Query: {
    health: async (_parent, _args, context) => {
      await query(context, 'SELECT 1');
      return { status: 'ok', database: 'connected', dataLoaderEnabled: context.useDataLoader };
    },
    authors: async (_p, _a, context) => (await query(context, 'SELECT * FROM authors ORDER BY id')).rows,
    author: (_p, { id }, context) => findOne(context, 'authors', id, 'Penulis'),
    publishers: async (_p, _a, context) => (await query(context, 'SELECT * FROM publishers ORDER BY id')).rows,
    publisher: (_p, { id }, context) => findOne(context, 'publishers', id, 'Penerbit'),
    books: async (_p, { authorId, publisherId, search }, context) => {
      const values = [];
      const conditions = [];
      if (authorId !== undefined) { values.push(authorId); conditions.push(`author_id = $${values.length}`); }
      if (publisherId !== undefined) { values.push(publisherId); conditions.push(`publisher_id = $${values.length}`); }
      if (search?.trim()) { values.push(`%${search.trim()}%`); conditions.push(`title ILIKE $${values.length}`); }
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      try {
        return (await query(context, `SELECT * FROM books${where} ORDER BY id`, values)).rows;
      } catch (error) { throw databaseError(error); }
    },
    book: (_p, { id }, context) => findOne(context, 'books', id, 'Buku'),
  },
  Mutation: {
    createAuthor: async (_p, { input }, context) => {
      const values = [nonBlank(input.name, 'name'), nonBlank(input.country, 'country')];
      try {
        return (await query(context, 'INSERT INTO authors (name, country) VALUES ($1, $2) RETURNING *', values)).rows[0];
      } catch (error) { throw databaseError(error); }
    },
    updateAuthor: (_p, { id, input }, context) => updateOne(context, 'authors', id, {
      ...input,
      ...(input.name !== undefined && { name: nonBlank(input.name, 'name') }),
      ...(input.country !== undefined && { country: nonBlank(input.country, 'country') }),
    }, 'Penulis'),
    deleteAuthor: (_p, { id }, context) => deleteOne(context, 'authors', id, 'Penulis'),
    createPublisher: async (_p, { input }, context) => {
      const values = [nonBlank(input.name, 'name'), nonBlank(input.city, 'city')];
      try {
        return (await query(context, 'INSERT INTO publishers (name, city) VALUES ($1, $2) RETURNING *', values)).rows[0];
      } catch (error) { throw databaseError(error); }
    },
    updatePublisher: (_p, { id, input }, context) => updateOne(context, 'publishers', id, {
      ...input,
      ...(input.name !== undefined && { name: nonBlank(input.name, 'name') }),
      ...(input.city !== undefined && { city: nonBlank(input.city, 'city') }),
    }, 'Penerbit'),
    deletePublisher: (_p, { id }, context) => deleteOne(context, 'publishers', id, 'Penerbit'),
    createBook: async (_p, { input }, context) => {
      const value = toSnakeCase(validateBook(input));
      try {
        return (await query(context,
          `INSERT INTO books (title, isbn, publication_year, author_id, publisher_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [value.title, value.isbn, value.publication_year, value.author_id, value.publisher_id],
        )).rows[0];
      } catch (error) { throw databaseError(error); }
    },
    updateBook: (_p, { id, input }, context) =>
      updateOne(context, 'books', id, validateBook(input, true), 'Buku'),
    deleteBook: (_p, { id }, context) => deleteOne(context, 'books', id, 'Buku'),
  },
};

function requireAuthenticatedUser(resolver) {
  return (parent, args, context, info) => {
    if (!context?.user) {
      throw new GraphQLError('Unauthorized: silakan login terlebih dahulu', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }
    return resolver(parent, args, context, info);
  };
}

export const resolvers = {
  ...baseResolvers,
  Mutation: Object.fromEntries(
    Object.entries(baseResolvers.Mutation).map(([name, resolver]) => [name, requireAuthenticatedUser(resolver)]),
  ),
};
