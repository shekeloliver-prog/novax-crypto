import { Pool, type PoolClient } from "pg";

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

const STARTING_CASH_BALANCE = 8750;

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

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      cash_balance NUMERIC NOT NULL DEFAULT ${STARTING_CASH_BALANCE},
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS holdings (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      UNIQUE (user_id, symbol)
    );
    CREATE TABLE IF NOT EXISTS trades (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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

// --- Accounts & paper-trading portfolio ---

export type User = {
  id: number;
  email: string;
  password_hash: string;
  password_salt: string;
  cash_balance: number;
};

export type Holding = { symbol: string; quantity: number };

export type Trade = {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  created_at: string;
};

export { STARTING_CASH_BALANCE };

export async function createUser(email: string, passwordHash: string, passwordSalt: string): Promise<User> {
  const result = await getPool().query<User>(
    `INSERT INTO users (email, password_hash, password_salt, cash_balance)
     VALUES ($1, $2, $3, ${STARTING_CASH_BALANCE})
     RETURNING id, email, password_hash, password_salt, cash_balance`,
    [email.toLowerCase().trim(), passwordHash, passwordSalt]
  );
  return result.rows[0];
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await getPool().query<User>(
    `SELECT id, email, password_hash, password_salt, cash_balance FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
  const result = await getPool().query<User>(
    `SELECT id, email, password_hash, password_salt, cash_balance FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getHoldings(userId: number): Promise<Holding[]> {
  const result = await getPool().query<{ symbol: string; quantity: string }>(
    `SELECT symbol, quantity FROM holdings WHERE user_id = $1 AND quantity > 0 ORDER BY symbol`,
    [userId]
  );
  return result.rows.map((r) => ({ symbol: r.symbol, quantity: Number(r.quantity) }));
}

export async function getTrades(userId: number, limit = 20): Promise<Trade[]> {
  const result = await getPool().query<{
    id: number;
    symbol: string;
    side: "buy" | "sell";
    quantity: string;
    price: string;
    total: string;
    created_at: string;
  }>(
    `SELECT id, symbol, side, quantity, price, total, created_at
     FROM trades WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    side: r.side,
    quantity: Number(r.quantity),
    price: Number(r.price),
    total: Number(r.total),
    created_at: r.created_at,
  }));
}

// Executes a buy or sell as one atomic transaction: validates funds/holdings
// against the given live price, updates cash + holdings, and records the
// trade. Throws with a user-facing message on invalid trades.
export async function executeTrade(
  userId: number,
  symbol: string,
  side: "buy" | "sell",
  quantity: number,
  price: number
): Promise<{ cashBalance: number; holdingQuantity: number }> {
  if (!(quantity > 0) || !Number.isFinite(quantity)) throw new Error("Enter a valid quantity.");
  const total = quantity * price;

  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query<{ cash_balance: string }>(
      `SELECT cash_balance FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userResult.rows.length === 0) throw new Error("Account not found.");
    const cashBalance = Number(userResult.rows[0].cash_balance);

    const holdingResult = await client.query<{ quantity: string }>(
      `SELECT quantity FROM holdings WHERE user_id = $1 AND symbol = $2 FOR UPDATE`,
      [userId, symbol]
    );
    const currentQuantity = Number(holdingResult.rows[0]?.quantity ?? 0);

    let newCashBalance: number;
    let newHoldingQuantity: number;

    if (side === "buy") {
      if (total > cashBalance) throw new Error("Not enough cash for this trade.");
      newCashBalance = cashBalance - total;
      newHoldingQuantity = currentQuantity + quantity;
    } else {
      if (quantity > currentQuantity) throw new Error("You don't own that much to sell.");
      newCashBalance = cashBalance + total;
      newHoldingQuantity = currentQuantity - quantity;
    }

    await client.query(`UPDATE users SET cash_balance = $1 WHERE id = $2`, [newCashBalance, userId]);
    await client.query(
      `INSERT INTO holdings (user_id, symbol, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, symbol) DO UPDATE SET quantity = $3`,
      [userId, symbol, newHoldingQuantity]
    );
    await client.query(
      `INSERT INTO trades (user_id, symbol, side, quantity, price, total) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, symbol, side, quantity, price, total]
    );

    await client.query("COMMIT");
    return { cashBalance: newCashBalance, holdingQuantity: newHoldingQuantity };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
