const endpoint = '/api/graphql';

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '64px auto', padding: 24 }}>
      <p style={{ color: '#5b21b6', fontWeight: 700 }}>PRAKTIKUM WEB SERVICE · SESI 04–05 & 07</p>
      <h1>Library GraphQL API</h1>
      <p>API GraphQL berbasis Apollo Server, Neon PostgreSQL, dan Next.js/Vercel.</p>
      <ul>
        <li>Tiga tabel berelasi: authors, publishers, books</li>
        <li>Query, mutation CRUD dengan JWT GitHub OAuth2, nested resolver dua arah</li>
        <li>DataLoader dan counter audit N+1 per request</li>
      </ul>
      <p><a href={endpoint}>Buka endpoint GraphQL</a></p>
      <p><a href="/auth/login">Login dengan GitHub untuk mendapatkan JWT mutation</a></p>
      <p><a href="/api/health">Periksa koneksi database</a></p>
    </main>
  );
}
