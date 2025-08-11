import { neon } from '@netlify/neon';
const sql = neon(); // automatically uses env NETLIFY_DATABASE_URL

// Beispielabfrage aus deiner Vorgabe:
// const [post] = await sql`SELECT * FROM posts WHERE id = ${postId}`;

async function ensureSchema(){
  await sql`create table if not exists glowflow_products (
    id text primary key,
    user_email text not null,
    data jsonb not null,
    updated_at timestamptz default now()
  );`;
  await sql`create index if not exists idx_gf_email on glowflow_products (user_email);`;
}

const json = (status, data) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(data),
});

export const handler = async (event) => {
  try {
    await ensureSchema();
    if (event.httpMethod === 'GET') {
      const { email } = event.queryStringParameters || {};
      if (!email) return json(400, { error: 'email required' });
      const rows = await sql`select id, data, updated_at from glowflow_products where user_email = ${email} order by updated_at desc`;
      return json(200, { products: rows.map(r => r.data) });
    }
    if (event.httpMethod === 'POST') {
      const { email, products } = JSON.parse(event.body || '{}');
      if (!email) return json(400, { error: 'email required' });
      if (!Array.isArray(products)) return json(400, { error: 'products array required' });
      const now = new Date().toISOString();
      for (const p of products) {
        const id = String(p.id || (globalThis.crypto?.randomUUID?.() || `p_${Date.now()}_${Math.random().toString(36).slice(2)}`));
        p.id = id;
        await sql`insert into glowflow_products (id, user_email, data, updated_at)
                  values (${id}, ${email}, ${sql.json(p)}, ${now})
                  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at`;
      }
      return json(200, { ok: true, count: products.length });
    }
    if (event.httpMethod === 'DELETE') {
      const { email } = JSON.parse(event.body || '{}');
      if (!email) return json(400, { error: 'email required' });
      await sql`delete from glowflow_products where user_email = ${email}`;
      return json(200, { ok: true });
    }
    return json(405, { error: 'method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};