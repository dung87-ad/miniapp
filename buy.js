import { getUser } from '../../lib/auth.js';
import { getKeys, saveKeys, getUsers, saveUsers, getTransactions, saveTransactions, getSellers } from '../../lib/db.js';
import { PRODUCTS, getPrice, isSeller, notifyAdmin, ok, err } from '../../lib/helpers.js';
import { ADMIN_ID } from '../../lib/auth.js';
import { randomBytes } from 'crypto';

const BOT_TOKEN = process.env.BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);
  const { init_data, prod_id } = req.body;

  const user = getUser(init_data);
  if (!user) return err(res, 'Unauthorized', 401);
  const uid = String(user.id);

  if (!PRODUCTS[prod_id]) return err(res, 'Sản phẩm không tồn tại');

  const [keys, users, sellers, txs] = await Promise.all([
    getKeys(), getUsers(), getSellers(), getTransactions()
  ]);

  const price   = getPrice(uid, prod_id, sellers);
  const balance = users[uid]?.balance || 0;
  const tid     = randomBytes(4).toString('hex');
  const seller  = isSeller(uid, sellers);

  if ((keys[prod_id] || []).length === 0) {
    txs.push({ user_id: uid, type: 'mua', amount: price, status: 'failed', trans_id: tid, details: 'Hết key', time: Date.now() / 1000 });
    await saveTransactions(txs);
    return err(res, 'Hết key');
  }

  if (balance < price) {
    txs.push({ user_id: uid, type: 'mua', amount: price, status: 'failed', trans_id: tid, details: 'Không đủ số dư', time: Date.now() / 1000 });
    await saveTransactions(txs);
    return err(res, `Không đủ số dư. Cần ${price.toLocaleString('vi-VN')}đ, có ${balance.toLocaleString('vi-VN')}đ`);
  }

  const key = keys[prod_id].shift();
  users[uid].balance -= price;

  const sellerTag = seller ? ' (Seller -10%)' : '';
  txs.push({ user_id: uid, type: 'mua', amount: price, status: 'success', trans_id: tid, details: `Mua ${PRODUCTS[prod_id].name}${sellerTag}`, time: Date.now() / 1000 });

  await Promise.all([saveKeys(keys), saveUsers(users), saveTransactions(txs)]);

  await notifyAdmin(ADMIN_ID,
    `🛍 <b>BÁN KEY MỚI</b>\n👤 ${user.first_name} (<code>${uid}</code>)\n📦 ${PRODUCTS[prod_id].name}\n💵 ${price.toLocaleString('vi-VN')}đ${sellerTag}\n🔑 <code>${key}</code>`,
    BOT_TOKEN
  );

  return ok(res, { key, balance: users[uid].balance });
}
