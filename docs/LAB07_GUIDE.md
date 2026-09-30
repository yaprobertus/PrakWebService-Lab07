# Lab 07 — GitHub OAuth2 dan proteksi mutation

## Kesesuaian dengan proyek

Contoh soal menggunakan `createProduct`; proyek ini memakai tabel `books`, `authors`, dan `publishers`. Karena itu contoh yang diuji ialah `createBook`. Seluruh sembilan mutation CRUD dilindungi JWT agar tidak ada jalur penulisan tanpa autentikasi. Query dari Lab 04/05, resolver relasi, DataLoader, audit N+1, dan endpoint REST GET tetap bekerja tanpa login.

## Konfigurasi GitHub OAuth App

1. Buka GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Application name: misalnya `Praktikum Web Service Library API` (nama harus tersedia di akun GitHub Anda).
3. Homepage URL: `https://praktikumwebserviceweek4.vercel.app/`.
4. Authorization callback URL: `https://praktikumwebserviceweek4.vercel.app/auth/callback`.
5. Simpan Client ID dan buat Client Secret. Simpan keduanya secara pribadi. Jangan tempel secret ke Apollo Sandbox, Git, laporan, atau chat.
6. Di Vercel project `praktikumwebserviceweek4` → Settings → Environment Variables, buat `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CALLBACK_URL`, dan `JWT_SECRET`. `CALLBACK_URL` harus sama persis dengan langkah 4. `JWT_SECRET` harus acak dan minimal 32 karakter. Pilih environment Production (dan Preview/Development hanya jika memang digunakan), lalu redeploy Production.

## Alur dan endpoint

1. `GET /auth/login` membuat nilai `state` acak, menyimpannya dalam cookie HttpOnly sementara, dan mengarahkan browser ke GitHub dengan `client_id`, `redirect_uri`, dan `state`.
2. Pengguna memberi izin di GitHub. GitHub mengembalikan `code` dan `state` ke `GET /auth/callback`.
3. Callback memeriksa `state`, lalu server menukar `code` dengan GitHub access token memakai Client Secret. Server mengambil profil melalui `https://api.github.com/user` dan menerbitkan JWT aplikasi yang berlaku satu jam. Respons callback berisi `token`, `tokenType`, `expiresIn`, dan `username`.
4. Apollo Server memeriksa header `Authorization: Bearer <JWT>` pada setiap request. Seluruh mutation menolak request anonim atau token tidak valid dengan GraphQL error `UNAUTHENTICATED`. Query tidak berubah.

## Uji di Apollo Sandbox dan dua screenshot wajib

Apollo Sandbox: https://studio.apollographql.com/sandbox/explorer?endpoint=https%3A%2F%2Fpraktikumwebserviceweek4.vercel.app%2Fapi%2Fgraphql

Sebelum mutation, jalankan `query { authors { id name } publishers { id name } }` untuk memastikan `authorId` dan `publisherId` nyata. Contoh di bawah memakai ID `1`; ganti jika data Anda berbeda. Pilih ISBN uji yang belum ada (10–20 karakter, angka/X/tanda hubung).

Tempel mutation **yang sama** untuk kedua screenshot:

```graphql
mutation CreateBookLab07($isbn: String!, $authorId: ID!, $publisherId: ID!) {
  createBook(input: {
    title: "Buku Uji OAuth Lab 07"
    isbn: $isbn
    publicationYear: 2026
    authorId: $authorId
    publisherId: $publisherId
  }) {
    id
    title
    isbn
    author { name }
    publisher { name }
  }
}
```

Variables (ganti ID/ISBN bila perlu):

```json
{ "isbn": "9786021409275", "authorId": "1", "publisherId": "1" }
```

**Screenshot 1 — ditolak tanpa Authorization.** Hapus header Authorization di tab Headers, jalankan mutation. Tampilkan editor mutation, panel Headers yang kosong, dan respons `errors[].extensions.code: "UNAUTHENTICATED"`. Kegagalan terjadi sebelum SQL INSERT; buku belum dibuat.

**Screenshot 2 — berhasil dengan JWT.** Buka `https://praktikumwebserviceweek4.vercel.app/auth/login` pada browser, login/beri izin di GitHub, lalu salin nilai `token` dari respons callback. Di Apollo Sandbox → Headers → New header, isi `Authorization` dan `Bearer <token>` (ada spasi sesudah Bearer). Jalankan mutation yang sama; tampilkan editor, indikasi header Authorization, dan respons `data.createBook` berisi ID/judul/ISBN. **Samarkan sebagian besar token pada screenshot**; JWT utuh adalah kredensial sementara.

Opsional untuk membuktikan persistensi, jalankan `query { books(search: "Buku Uji OAuth Lab 07") { id title isbn } }`. Jika ingin membersihkan data uji sesudah screenshot, panggil `deleteBook(id: "ID_DARI_RESPONSE")` dengan JWT yang sama. Hapus header saat pengujian query lama untuk memastikan fitur baca masih normal.

## Yang dikumpulkan sebelum Lab 08

- Dua screenshot Apollo Sandbox di atas: mutation ditolak tanpa header dan mutation berhasil dengan JWT setelah login GitHub.
- Refleksi **2–3 kalimat** tentang bagian alur OAuth2 yang paling membingungkan saat pertama dicoba. Tulis berdasarkan pengalaman Anda sendiri setelah pengujian.
- Link Apollo Sandbox yang sudah menunjuk endpoint deployment, plus link Git dan Vercel bila diminta dosen. URL `/api/graphql` adalah endpoint API; URL `studio.apollographql.com/sandbox/explorer?endpoint=...` adalah link Apollo Sandbox.

Jangan kirim Client Secret, JWT Secret, GitHub access token, atau JWT utuh dalam screenshot/laporan.
