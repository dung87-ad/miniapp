import { getUser } from './lib/auth.js';
import { getTransactions } from './lib/db.js';
import { ok, err } from './lib/helpers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data } = req.body;
  const user = getUser(init_data);
  if (!user) return err(res, 'Unauthorized', 401);
  const uid = String(user.id);
  const all = await getTransactions();
  const mine = all.filter(t => t.user_id === uid).sort((a, b) => b.time - a.time).slice(0, 30);
  return ok(res, mine);
}
