import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { randomBytes } from 'crypto';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const BOT_TOKEN   = process.env.BOT_TOKEN;
const ADMIN_ID    = process.env.ADMIN_ID;
const BANK_ACC    = process.env.BANK_ACCOUNT  || '1066207939';
const BANK_OWNER  = process.env.BANK_OWNER    || 'NGUYEN DUC DUNG';
const BANK_NAME   = 'VietComBank';
const BANK_API    = process.env.BANK_API_URL  || 'https://thueapibank.vn/historyapivcb/63c6637751cc3746b6b3a3e8585fec9e';

const PRODUCTS = {
  fluorite_1d:  { name: 'Fluorite iOS 1 Ngày',  price: 90000  },
  fluorite_7d:  { name: 'Fluorite iOS 7 Ngày',  price: 190000 },
  fluorite_31d: { name: 'Fluorite iOS 31 Ngày', price: 280000 },
};

// ── REDIS ────────────────────────────────────────────────────────────────────
const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const dbGet = async (k, d) => { try { const v = await redis.get(k); return v ?? d; } catch { return d; } };
const dbSet = (k, v) => redis.set(k, v);

const db = {
  keys:    { get: () => dbGet('keys_db', {fluorite_1d:[],fluorite_7d:[],fluorite_31d:[]}), set: v => dbSet('keys_db', v) },
  users:   { get: () => dbGet('users_db', {}),         set: v => dbSet('users_db', v) },
  members: { get: () => dbGet('members_db', {}),       set: v => dbSet('members_db', v) },
  txs:     { get: () => dbGet('transactions_db', []),  set: v => dbSet('transactions_db', v) },
  sellers: { get: () => dbGet('sellers_db', []),       set: v => dbSet('sellers_db', v) },
  pending: { get: () => dbGet('pending_tx', {}),       set: v => dbSet('pending_tx', v) },
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
function getUser(initData) {
  if (!BOT_TOKEN) return { id: ADMIN_ID || '0', first_name: 'Dev', username: 'dev' };
  try {
    const p = new URLSearchParams(initData);
    const hash = p.get('hash'); p.delete('hash');
    const dc = [...p.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
    const sec = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    if (crypto.createHmac('sha256', sec).update(dc).digest('hex') !== hash) return null;
    return JSON.parse(p.get('user') || '{}');
  } catch { return null; }
}

const isAdmin   = u => String(u.id) === String(ADMIN_ID);
const isSeller  = (uid, sellers) => sellers.includes(String(uid));
const getPrice  = (uid, id, sellers) => { const b = PRODUCTS[id]?.price||0; return isSeller(uid,sellers) ? Math.floor(b*.9) : b; };
const qrUrl     = (a, d) => `https://img.vietqr.io/image/${BANK_NAME}-${BANK_ACC}-qr_only.png?amount=${a}&addInfo=${d}&accountName=${encodeURIComponent(BANK_OWNER)}`;
const R         = (res, d, c=200) => res.status(c).json(d);
const ERR       = (res, m, c=400) => res.status(c).json({ detail: m });

async function tgSend(chat_id, text) {
  if (!BOT_TOKEN) return;
  try { await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chat_id, text, parse_mode:'HTML'}) }); } catch {}
}

// ── ROUTER ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return ERR(res, 'POST only', 405);

  const path = body._path || req.url.replace(/^\/api\/?/, '').split('/')[0] || 'me';
  const body = req.body || {};

  const user = getUser(body.init_data);
  if (!user) return ERR(res, 'Unauthorized', 401);
  const uid = String(user.id);

  // ── /api/me ───────────────────────────────────────────────────────────────
  if (path === 'me') {
    const [users, members, sellers] = await Promise.all([db.users.get(), db.members.get(), db.sellers.get()]);
    members[uid] = { username: user.username||'', first_name: user.first_name||'', last_name: user.last_name||'' };
    await db.members.set(members);
    if (!users[uid]) { users[uid] = {balance:0,total_nap:0,weekly_nap:0,monthly_nap:0}; await db.users.set(users); }
    return R(res, { id:uid, first_name:user.first_name||'', username:user.username||'', balance:users[uid].balance, total_nap:users[uid].total_nap, is_seller:isSeller(uid,sellers), is_admin:isAdmin(user) });
  }

  // ── /api/products ─────────────────────────────────────────────────────────
  if (path === 'products') {
    const [keys, sellers] = await Promise.all([db.keys.get(), db.sellers.get()]);
    return R(res, Object.entries(PRODUCTS).map(([id,p]) => ({ id, name:p.name, price:getPrice(uid,id,sellers), base_price:p.price, stock:(keys[id]||[]).length })));
  }

  // ── /api/transactions ─────────────────────────────────────────────────────
  if (path === 'transactions') {
    const all = await db.txs.get();
    return R(res, all.filter(t => t.user_id === uid).sort((a,b) => b.time-a.time).slice(0,30));
  }

  // ── /api/top ──────────────────────────────────────────────────────────────
  if (path === 'top') {
    const [users, members] = await Promise.all([db.users.get(), db.members.get()]);
    const w=[], m=[];
    for (const [id,d] of Object.entries(users)) {
      const n = members[id]?.first_name || id;
      if (d.weekly_nap>0) w.push({uid:id,name:n,amount:d.weekly_nap});
      if (d.monthly_nap>0) m.push({uid:id,name:n,amount:d.monthly_nap});
    }
    w.sort((a,b)=>b.amount-a.amount); m.sort((a,b)=>b.amount-a.amount);
    return R(res, { week:w.slice(0,10), month:m.slice(0,10) });
  }

  // ── /api/deposit ──────────────────────────────────────────────────────────
  if (path === 'deposit') {
    const { action, amount, trans_id } = body;
    if (action === 'create') {
      if (!amount || amount < 10000) return ERR(res, 'Tối thiểu 10,000đ');
      const pending = await db.pending.get();
      if (pending[uid]) return ERR(res, 'Bạn đang có giao dịch chờ');
      const tid = randomBytes(4).toString('hex'), desc = `NAP_${tid}`;
      pending[uid] = { trans_id:tid, amount, created_at:Date.now() };
      await db.pending.set(pending);
      const txs = await db.txs.get();
      txs.push({ user_id:uid, type:'nap', amount, status:'pending', trans_id:tid, details:'', time:Date.now()/1000 });
      await db.txs.set(txs);
      return R(res, { trans_id:tid, description:desc, amount, bank_name:BANK_NAME, account_number:BANK_ACC, account_name:BANK_OWNER, qr_url:qrUrl(amount,desc) });
    }
    if (action === 'poll') {
      const pending = await db.pending.get(), td = pending[uid];
      if (!td || td.trans_id !== trans_id) return ERR(res, 'Không tìm thấy giao dịch');
      if (Date.now()-td.created_at > 300000) {
        delete pending[uid]; await db.pending.set(pending);
        const txs = await db.txs.get(); const t = txs.find(x=>x.trans_id===trans_id); if(t) t.status='failed';
        await db.txs.set(txs); return R(res, {status:'timeout'});
      }
      try {
        const r = await fetch(BANK_API, {signal:AbortSignal.timeout(12000)});
        const data = await r.json(), list = Array.isArray(data)?data:(data.transactions||[]);
        let paid = false;
        for (const tx of list) {
          const d=String(tx.Description||tx.description||tx.Remark||''), cd=String(tx.CD||tx.cd||'');
          const a=parseFloat(String(tx.Amount||tx.amount||'0').replace(/,/g,''))||0;
          if ((d.includes(`NAP_${trans_id}`)||d.includes(`NAP${trans_id}`)) && cd==='+' && a>=td.amount) { paid=true; break; }
        }
        if (paid) {
          delete pending[uid]; await db.pending.set(pending);
          const users = await db.users.get();
          if (!users[uid]) users[uid]={balance:0,total_nap:0,weekly_nap:0,monthly_nap:0};
          for (const k of ['balance','total_nap','weekly_nap','monthly_nap']) users[uid][k]=(users[uid][k]||0)+td.amount;
          await db.users.set(users);
          const txs=await db.txs.get(), t=txs.find(x=>x.trans_id===trans_id); if(t) t.status='success';
          await db.txs.set(txs);
          await tgSend(ADMIN_ID, `💰 <b>NẠP MỚI</b>\n👤 ${user.first_name} (<code>${uid}</code>)\n💵 +${td.amount.toLocaleString('vi-VN')}đ`);
          return R(res, {status:'success', balance:users[uid].balance});
        }
        return R(res, {status:'pending'});
      } catch { return R(res, {status:'pending'}); }
    }
    if (action === 'cancel') {
      const pending=await db.pending.get();
      if (pending[uid]) { const tid=pending[uid].trans_id; delete pending[uid]; await db.pending.set(pending); const txs=await db.txs.get(); const t=txs.find(x=>x.trans_id===tid); if(t) t.status='failed'; await db.txs.set(txs); }
      return R(res, {ok:true});
    }
  }

  // ── /api/buy ──────────────────────────────────────────────────────────────
  if (path === 'buy') {
    const { prod_id } = body;
    if (!PRODUCTS[prod_id]) return ERR(res, 'Sản phẩm không tồn tại');
    const [keys,users,sellers,txs] = await Promise.all([db.keys.get(),db.users.get(),db.sellers.get(),db.txs.get()]);
    const price=getPrice(uid,prod_id,sellers), balance=users[uid]?.balance||0, tid=randomBytes(4).toString('hex');
    if (!(keys[prod_id]||[]).length) { txs.push({user_id:uid,type:'mua',amount:price,status:'failed',trans_id:tid,details:'Hết key',time:Date.now()/1000}); await db.txs.set(txs); return ERR(res,'Hết key'); }
    if (balance<price) { txs.push({user_id:uid,type:'mua',amount:price,status:'failed',trans_id:tid,details:'Không đủ số dư',time:Date.now()/1000}); await db.txs.set(txs); return ERR(res,`Không đủ số dư. Cần ${price.toLocaleString('vi-VN')}đ`); }
    const key=keys[prod_id].shift(), st=isSeller(uid,sellers)?' (Seller -10%)':'';
    if (!users[uid]) users[uid]={balance:0,total_nap:0,weekly_nap:0,monthly_nap:0};
    users[uid].balance-=price;
    txs.push({user_id:uid,type:'mua',amount:price,status:'success',trans_id:tid,details:`Mua ${PRODUCTS[prod_id].name}${st}`,time:Date.now()/1000});
    await Promise.all([db.keys.set(keys),db.users.set(users),db.txs.set(txs)]);
    await tgSend(ADMIN_ID, `🛍 <b>BÁN KEY</b>\n👤 ${user.first_name} (<code>${uid}</code>)\n📦 ${PRODUCTS[prod_id].name}\n💵 ${price.toLocaleString('vi-VN')}đ${st}\n🔑 <code>${key}</code>`);
    return R(res, {key, balance:users[uid].balance});
  }

  // ── /api/admin ────────────────────────────────────────────────────────────
  if (path === 'admin') {
    if (!isAdmin(user)) return ERR(res, 'Forbidden', 403);
    const { action, ...rest } = body;
    if (action==='stats') {
      const [keys,users,sellers,txs]=await Promise.all([db.keys.get(),db.users.get(),db.sellers.get(),db.txs.get()]);
      return R(res,{keys:Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v.length])),total_users:Object.keys(users).length,total_sellers:sellers.length,total_balance:Object.values(users).reduce((s,u)=>s+(u.balance||0),0),total_revenue:txs.filter(t=>t.type==='mua'&&t.status==='success').reduce((s,t)=>s+t.amount,0)});
    }
    if (action==='keys') return R(res, await db.keys.get());
    if (action==='keys_add') {
      const keys=await db.keys.get(); const nk=rest.keys_text.trim().split('\n').map(k=>k.trim()).filter(Boolean);
      keys[rest.prod_id].push(...nk); await db.keys.set(keys); return R(res,{added:nk.length,total:keys[rest.prod_id].length});
    }
    if (action==='keys_delete') {
      const keys=await db.keys.get(); const del=keys[rest.prod_id].splice(rest.index,1)[0]; await db.keys.set(keys); return R(res,{deleted:del});
    }
    if (action==='sellers') {
      const [sellers,members]=await Promise.all([db.sellers.get(),db.members.get()]);
      return R(res,sellers.map(id=>({uid:id,name:members[id]?.first_name||id,username:members[id]?.username||''})));
    }
    if (action==='sellers_add') {
      const sellers=await db.sellers.get(), sid=String(rest.target_uid);
      if (sellers.includes(sid)) return ERR(res,'Đã là seller');
      sellers.push(sid); await db.sellers.set(sellers);
      await tgSend(sid,'🎉 Bạn được cấp quyền <b>Seller</b>.\n🏪 Key giảm <b>10%</b>!');
      return R(res,{ok:true});
    }
    if (action==='sellers_remove') {
      const sellers=await db.sellers.get(), i=sellers.indexOf(String(rest.target_uid));
      if (i===-1) return ERR(res,'Không phải seller');
      sellers.splice(i,1); await db.sellers.set(sellers); return R(res,{ok:true});
    }
    if (action==='users') {
      const [users,members,sellers]=await Promise.all([db.users.get(),db.members.get(),db.sellers.get()]);
      const r=Object.entries(members).map(([id,m])=>({uid:id,name:m.first_name||id,username:m.username||'',balance:(users[id]||{}).balance||0,total_nap:(users[id]||{}).total_nap||0,is_seller:sellers.includes(id)}));
      return R(res,r.sort((a,b)=>b.total_nap-a.total_nap));
    }
    if (action==='broadcast') {
      const members=await db.members.get(); let s=0,f=0;
      for (const id of Object.keys(members)) { try { const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:Number(id),text:rest.message,parse_mode:'HTML'})}); if(r.ok)s++;else f++; } catch{f++;} }
      return R(res,{success:s,fail:f});
    }
  }

  return ERR(res, 'Not found', 404);
}
