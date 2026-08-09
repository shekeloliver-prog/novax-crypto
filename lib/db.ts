import { Pool } from "pg";

// Any standard Postgres connection string works here (Neon, Supabase,
// Railway, etc.) — set DATABASE_URL in your deployment environment.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      unsubscribe_token TEXT UNIQUE NOT NULL,
      subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      unsubscribed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS newsletter_meta (
      id INT PRIMARY KEY DEFAULT 1,
      last_sent_at TIMESTAMPTZ,
      CHECK (id = 1)
    );
    INSERT INTO newsletter_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}

export async function addSubscriber(email: string, token: string): Promise<"added" | "exists"> {
  const result = await getPool().query(
    `INSERT INTO subscribers (email, unsubscribe_token)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL
     WHERE subscribers.unsubscribed_at IS NOT NULL
     RETURNING id`,
    [email.toLowerCase().trim(), token]
  );
  return result.rowCount && result.rowCount > 0 ? "added" : "exists";
}

export async function removeSubscriberByToken(token: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE subscribers SET unsubscribed_at = now()
     WHERE unsubscribe_token = $1 AND unsubscribed_at IS NULL`,
    [token]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getActiveSubscribers(): Promise<{ email: string; unsubscribe_token: string }[]> {
  const result = await getPool().query(
    `SELECT email, unsubscribe_token FROM subscribers WHERE unsubscribed_at IS NULL`
  );
  return result.rows;
}

export async function getLastSentAt(): Promise<Date | null> {
  const result = await getPool().query(`SELECT last_sent_at FROM newsletter_meta WHERE id = 1`);
  return result.rows[0]?.last_sent_at ?? null;
}

export async function setLastSentAt(date: Date): Promise<void> {
  await getPool().query(`UPDATE newsletter_meta SET last_sent_at = $1 WHERE id = 1`, [date]);
}
