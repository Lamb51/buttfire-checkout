// api/orders.js
//
// A minimal, protected way to look up past orders without needing a full
// admin dashboard. Requires an admin key so random visitors can't read
// customer emails/orders.
//
// Usage:
//   GET /api/orders?key=YOUR_ADMIN_API_KEY
//   GET /api/orders?key=YOUR_ADMIN_API_KEY&search=someone@email.com
//   GET /api/orders?key=YOUR_ADMIN_API_KEY&limit=50

const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key, search, limit } = req.query;

  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rowLimit = Math.min(parseInt(limit, 10) || 50, 200);

  try {
    const result = search
      ? await sql`
          SELECT * FROM orders
          WHERE customer_email ILIKE ${'%' + search + '%'}
          ORDER BY created_at DESC
          LIMIT ${rowLimit}
        `
      : await sql`
          SELECT * FROM orders
          ORDER BY created_at DESC
          LIMIT ${rowLimit}
        `;

    return res.status(200).json({ orders: result.rows });
  } catch (err) {
    console.error('Error fetching orders:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
