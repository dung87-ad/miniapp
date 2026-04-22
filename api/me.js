import { getUser, requireAdmin, ADMIN_ID } from './lib/auth.js';
import { getUsers, saveUsers, getMembers, saveMembers, getSellers } from './lib/db.js';
import { ok, err } from './lib/helpers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data } = req.body;
  const user = getUser(init_data);
  if (!user) return err(res, 'Unauthorized', 401);

  const uid = String(user.id);
  const [users, members, sellers] = await Promise.all([getUsers(), getMembers(), getSellers()]);

  members[uid] = { username: user.username || '', first_name: user.first_name || '', last_name: user.last_name || '' };
  await saveMembers(members);

  if (!users[uid]) {
    users[uid] = { balance: 0, total_nap: 0, weekly_nap: 0, monthly_nap: 0 };
    await saveUsers(users);
  }

  return ok(res, {
    id: uid,
    first_name: user.first_name || '',
    username: user.username || '',
    balance: users[uid].balance,
    total_nap: users[uid].total_nap,
    is_seller: sellers.includes(uid),
    is_admin: uid === String(ADMIN_ID),
  });
}
