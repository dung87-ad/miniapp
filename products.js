import { getUser } from '../../lib/auth.js';
import { getKeys, getSellers } from '../../lib/db.js';
import { PRODUCTS, getPrice, ok, err } from '../../lib/helpers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data } = req.body;
  const user = getUser(init_data);
  if (!user) return err(res, 'Unauthorized', 401);

  const [keys, sellers] = await Promise.all([getKeys(), getSellers()]);
  const uid = String(user.id);

  const result = Object.entries(PRODUCTS).map(([id, p]) => ({
    id,
    name: p.name,
    price: getPrice(uid, id, sellers),
    base_price: p.price,
    stock: (keys[id] || []).length,
  }));

  return ok(res, result);
}
