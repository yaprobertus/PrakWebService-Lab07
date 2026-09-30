# Praktikum Web Service — GraphQL Sesi 04–05 dan OAuth2 Lab 07

Implementasi GraphQL untuk domain perpustakaan kelompok: **authors**, **publishers**, dan **books**. API memakai Apollo Server, Next.js, PostgreSQL/Neon, resolver relasi dua arah, mutation CRUD, DataLoader, counter N+1 per request, dan login GitHub OAuth2 untuk melindungi mutation.

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env.local`.
2. Isi `DATABASE_URL` dengan **pooled connection string** Neon (hostname berisi `-pooler`). Jangan commit file environment.
3. Untuk Lab 07, daftarkan GitHub OAuth App dan isi `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CALLBACK_URL`, serta `JWT_SECRET` di `.env.local`. Callback lokal dapat memakai `http://localhost:3000/auth/callback`; daftarkan URL callback tersebut pada OAuth App jika hendak menguji lokal.
4. Jalankan:

```bash
npm install
npm run db:setup
npm run dev
```

Endpoint lokal:

- GraphQL: `http://localhost:3000/api/graphql`
- REST pembanding: `http://localhost:3000/api/books`
- Health: `http://localhost:3000/api/health`
- Login GitHub: `http://localhost:3000/auth/login`
- Callback OAuth: `http://localhost:3000/auth/callback`

## Query bukti

File siap tempel ke Apollo Sandbox tersedia di folder `graphql/`:

- `01-nested-query.graphql`: author → books → publisher
- `02-reverse-nested-query.graphql`: books → author + publisher
- `03-overfetching.graphql`: hanya meminta satu field `title`
- `04-mutations.graphql`: mutation create untuk semua entity
- `05-n-plus-one-demo.graphql`: audit N+1 dan DataLoader

Setiap response GraphQL memiliki `extensions.resolverAudit`. Untuk membuktikan N+1, tambahkan header Apollo Sandbox berikut:

```json
{ "x-n-plus-one-demo": "true" }
```

Jika ada N author, hasilnya `totalDatabaseQueries = 1 + N`. Hapus header untuk mengaktifkan DataLoader; query author beserta buku menjadi dua query database: satu root dan satu batch.

## Deploy ke Vercel

1. Hubungkan repository ke project Vercel `praktikumwebserviceweek4`.
2. Tambahkan `DATABASE_URL` pada Settings → Environment Variables untuk Production, Preview, dan Development. Gunakan versi pooled Neon.
3. Tambahkan `USE_DATALOADER=true`.
4. Tambahkan `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CALLBACK_URL=https://praktikumwebserviceweek4.vercel.app/auth/callback`, dan `JWT_SECRET` (minimal 32 karakter acak) pada Environment Variables Vercel. Daftarkan callback yang **sama persis** pada GitHub OAuth App. Jangan beri prefix `NEXT_PUBLIC_` pada secret.
5. Deploy dan pastikan `/api/health` memberi HTTP 200.
6. Buka `/auth/login`, izinkan akses GitHub, salin JWT dari callback, lalu jalankan mutation di Apollo Sandbox dengan header `Authorization: Bearer <JWT>`.

Jangan menaruh connection string Neon di source, screenshot, atau commit Git.
Jangan menaruh GitHub client secret, JWT secret, GitHub access token, atau JWT utuh di source, screenshot publik, atau commit Git. JWT aplikasi berlaku satu jam; login ulang setelah kedaluwarsa.

Seluruh 9 mutation (buku, penulis, penerbit) membutuhkan JWT valid. Query, introspection, REST GET, dan audit N+1 tetap dapat diakses tanpa login. Panduan uji, screenshot, dan pengumpulan Lab 07 ada di [`docs/LAB07_GUIDE.md`](docs/LAB07_GUIDE.md).

## Verifikasi

```bash
npm test
npm run build
```

Audit pemenuhan tugas ada di `docs/AUDIT.md`; teks pengumpulan siap salin ada di `docs/PENGUMPULAN.md`.
