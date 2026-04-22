import { getUser } from './lib/auth.js';
import { getUsers, getMembers } from './lib/db.js';
import { ok, err } from './lib/helpers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data } = req.body;
  if (!getUser(init_data)) return err(res, 'Unauthorized', 401);
  const [users, members] = await Promise.all([getUsers(), getMembers()]);
  const week = [], month = [];
  for (const [uid, d] of Object.entries(users)) {
    const name = members[uid]?.first_name || uid;
    if (d.weekly_nap > 0)  week.push({ uid, name, amount: d.weekly_nap });
    if (d.monthly_nap > 0) month.push({ uid, name, amount: d.monthly_nap });
  }
  week.sort((a, b) => b.amount - a.amount);
  month.sort((a, b) => b.amount - a.amount);
  return ok(res, { week: week.slice(0, 10), month: month.slice(0, 10) });
}
