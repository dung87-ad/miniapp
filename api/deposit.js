import { getUser } from './lib/auth.js';
import { getUsers, saveUsers, getTransactions, saveTransactions, getPending, savePending } from './lib/db.js';
import { BANK_NAME, BANK_ACC, BANK_OWNER, BANK_API_URL, qrUrl, notifyAdmin, ok, err } from './lib/helpers.js';
import { ADMIN_ID } from './lib/auth.js';
import { randomBytes } from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data, action, amount, trans_id } = req.body;

  const user = getUser(init_data);
  if (!user) return err(res, 'Unauthorized', 401);
  const uid = String(user.id);

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    if (!amount || amount < 10000) return err(res, 'Tối thiểu 10,000đ');
    const pending = await getPending();
    if (pending[uid]) return err(res, 'Bạn đang có giao dịch chờ');

    const tid = randomBytes(4).toString('hex');
    const desc = `NAP_${tid}`;
    pending[uid] = { trans_id: tid, amount, created_at: Date.now() };
    await savePending(pending);

    const txs = await getTransactions();
    txs.push({ user_id: uid, type: 'nap', amount, status: 'pending', trans_id: tid, details: '', time: Date.now() / 1000 });
    await saveTransactions(txs);

    return ok(res, {
      trans_id: tid, description: desc, amount,
      bank_name: BANK_NAME, account_number: BANK_ACC, account_name: BANK_OWNER,
      qr_url: qrUrl(amount, desc),
    });
  }

  // ── POLL ──────────────────────────────────────────────────────────────────
  if (action === 'poll') {
    const pending = await getPending();
    const td = pending[uid];
    if (!td || td.trans_id !== trans_id) return err(res, 'Không tìm thấy giao dịch');

    if (Date.now() - td.created_at > 5 * 60 * 1000) {
      delete pending[uid];
      await savePending(pending);
      const txs = await getTransactions();
      const t = txs.find(x => x.trans_id === trans_id);
      if (t) t.status = 'failed';
      await saveTransactions(txs);
      return ok(res, { status: 'timeout' });
    }

    try {
      const r = await fetch(BANK_API_URL, { signal: AbortSignal.timeout(12000) });
      const data = await r.json();
      const list = Array.isArray(data) ? data : (data.transactions || []);

      let paid = false;
      for (const tx of list) {
        const desc = String(tx.Description || tx.description || tx.Remark || '');
        const cd   = String(tx.CD || tx.cd || '');
        const raw  = String(tx.Amount || tx.amount || '0').replace(/,/g, '');
        const amt  = parseFloat(raw) || 0;
        const match = desc.includes(`NAP_${trans_id}`) || desc.includes(`NAP${trans_id}`);
        if (match && cd === '+' && amt >= td.amount) { paid = true; break; }
      }

      if (paid) {
        delete pending[uid];
        await savePending(pending);

        const users = await getUsers();
        if (!users[uid]) users[uid] = { balance: 0, total_nap: 0, weekly_nap: 0, monthly_nap: 0 };
        for (const k of ['balance', 'total_nap', 'weekly_nap', 'monthly_nap'])
          users[uid][k] = (users[uid][k] || 0) + td.amount;
        await saveUsers(users);

        const txs = await getTransactions();
        const t = txs.find(x => x.trans_id === trans_id);
        if (t) t.status = 'success';
        await saveTransactions(txs);

        await notifyAdmin(ADMIN_ID,
          `💰 <b>NẠP TIỀN MỚI</b>\n👤 ${user.first_name} (<code>${uid}</code>)\n💵 +${td.amount.toLocaleString('vi-VN')}đ`,
          BOT_TOKEN
        );
        return ok(res, { status: 'success', balance: users[uid].balance });
      }

      return ok(res, { status: 'pending' });
    } catch { return ok(res, { status: 'pending' }); }
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    const pending = await getPending();
    if (pending[uid]) {
      const tid = pending[uid].trans_id;
      delete pending[uid];
      await savePending(pending);
      const txs = await getTransactions();
      const t = txs.find(x => x.trans_id === tid);
      if (t) t.status = 'failed';
      await saveTransactions(txs);
    }
    return ok(res, { ok: true });
  }

  return err(res, 'Invalid action');
}
