-- schema.sql
-- Run this once against your Vercel Postgres database to create the
-- orders table. In the Vercel dashboard: Storage → your Postgres database
-- → Query tab → paste this in and run it. (Or use `psql` with the
-- connection string from that same page.)

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  customer_email TEXT,
  amount_total INTEGER NOT NULL,      -- cents
  currency TEXT NOT NULL,
  items JSONB NOT NULL,               -- [{ description, quantity, amount_total }]
  shipping_address JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
