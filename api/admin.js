import { getUser, requireAdmin, ADMIN_ID } from './lib/auth.js';
import { getKeys, saveKeys, getUsers, getMembers, getTransactions, getSellers, saveSellers } from './lib/db.js';
import { PRODUCTS, notifyAdmin, ok, err } from './lib/helpers.js';

const BOT_TOKEN = process.env.BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data, action, ...body } = req.body;

  const user = getUser(init_data);
  if (!user || !requireAdmin(user)) return err(res, 'Forbidden', 403);

  // ── STATS ─────────────────────────────────────────────────────────────────
  if (action === 'stats') {
    const [keys, users, sellers, txs] = await Promise.all([getKeys(), getUsers(), getSellers(), getTransactions()]);
    return ok(res, {
      keys: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.length])),
      total_users: Object.keys(users).length,
      total_sellers: sellers.length,
      total_balance: Object.values(users).reduce((s, u) => s + (u.balance || 0), 0),
      total_revenue: txs.filter(t => t.type === 'mua' && t.status === 'success').reduce((s, t) => s + t.amount, 0),
    });
  }

  // ── KEYS LIST ─────────────────────────────────────────────────────────────
  if (action === 'keys') {
    return ok(res, await getKeys());
  }

  // ── KEYS ADD ──────────────────────────────────────────────────────────────
  if (action === 'keys_add') {
    const { prod_id, keys_text } = body;
    if (!PRODUCTS[prod_id]) return err(res, 'prod_id không hợp lệ');
    const keys = await getKeys();
    const newKeys = keys_text.trim().split('\n').map(k => k.trim()).filter(Boolean);
    keys[prod_id].push(...newKeys);
    await saveKeys(keys);
    return ok(res, { added: newKeys.length, total: keys[prod_id].length });
  }

  // ── KEYS DELETE ───────────────────────────────────────────────────────────
  if (action === 'keys_delete') {
    const { prod_id, index } = body;
    const keys = await getKeys();
    if (!keys[prod_id] || index < 0 || index >= keys[prod_id].length) return err(res, 'Index không hợp lệ');
    const deleted = keys[prod_id].splice(index, 1)[0];
    await saveKeys(keys);
    return ok(res, { deleted });
  }

  // ── SELLERS LIST ──────────────────────────────────────────────────────────
  if (action === 'sellers') {
    const [sellers, members] = await Promise.all([getSellers(), getMembers()]);
    return ok(res, sellers.map(uid => ({
      uid, name: members[uid]?.first_name || uid, username: members[uid]?.username || ''
    })));
  }

  // ── SELLERS ADD ───────────────────────────────────────────────────────────
  if (action === 'sellers_add') {
    const uid = String(body.target_uid);
    const sellers = await getSellers();
    if (sellers.includes(uid)) return err(res, 'Đã là seller');
    sellers.push(uid);
    await saveSellers(sellers);
    await notifyAdmin(uid,
      `🎉 <b>Chúc mừng!</b> Bạn vừa được cấp quyền <b>Seller</b>.\n🏪 Toàn bộ key giảm <b>10%</b>!`,
      BOT_TOKEN
    );
    return ok(res, { ok: true });
  }

  // ── SELLERS REMOVE ────────────────────────────────────────────────────────
  if (action === 'sellers_remove') {
    const uid = String(body.target_uid);
    const sellers = await getSellers();
    const idx = sellers.indexOf(uid);
    if (idx === -1) return err(res, 'Không phải seller');
    sellers.splice(idx, 1);
    await saveSellers(sellers);
    return ok(res, { ok: true });
  }

  // ── USERS LIST ────────────────────────────────────────────────────────────
  if (action === 'users') {
    const [users, members, sellers] = await Promise.all([getUsers(), getMembers(), getSellers()]);
    const result = Object.entries(members).map(([uid, m]) => {
      const u = users[uid] || {};
      return { uid, name: m.first_name || uid, username: m.username || '', balance: u.balance || 0, total_nap: u.total_nap || 0, is_seller: sellers.includes(uid) };
    });
    result.sort((a, b) => b.total_nap - a.total_nap);
    return ok(res, result);
  }

  // ── BROADCAST ─────────────────────────────────────────────────────────────
  if (action === 'broadcast') {
    const { message } = body;
    const members = await getMembers();
    let success = 0, fail = 0;
    for (const uid of Object.keys(members)) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: Number(uid), text: message, parse_mode: 'HTML' }),
        });
        if (r.ok) success++; else fail++;
      } catch { fail++; }
    }
    return ok(res, { success, fail });
  }

  return err(res, 'Invalid action');
}
