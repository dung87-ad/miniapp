import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { randomBytes } from 'crypto';

const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_ID   = process.env.ADMIN_ID;
const BANK_ACC   = process.env.BANK_ACCOUNT || '1066207939';
const BANK_OWNER = process.env.BANK_OWNER   || 'NGUYEN DUC DUNG';
const BANK_NAME  = 'VietComBank';
const BANK_API   = process.env.BANK_API_URL || 'https://thueapibank.vn/historyapivcb/63c6637751cc3746b6b3a3e8585fec9e';

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const dbGet = async (k, d) => { try { const v = await redis.get(k); return v ?? d; } catch { return d; } };
const dbSet = (k, v) => redis.set(k, v);

const db = {
  products: { get: () => dbGet('products_db', {}),      set: v => dbSet('products_db', v) },
  keys:     { get: () => dbGet('keys_db', {}),          set: v => dbSet('keys_db', v) },
  users:    { get: () => dbGet('users_db', {}),         set: v => dbSet('users_db', v) },
  members:  { get: () => dbGet('members_db', {}),       set: v => dbSet('members_db', v) },
  txs:      { get: () => dbGet('transactions_db', []),  set: v => dbSet('transactions_db', v) },
  sellers:  { get: () => dbGet('sellers_db', {}),       set: v => dbSet('sellers_db', v) },
  pending:  { get: () => dbGet('pending_tx', {}),       set: v => dbSet('pending_tx', v) },
};

function getUser(initData) {
  if (!initData || initData === 'undefined' || initData === '') return null;
  let parsedUser = null;
  try {
    const p0 = new URLSearchParams(initData);
    const u = p0.get('user');
    if (u) { parsedUser = JSON.parse(u); if (!parsedUser?.id) parsedUser = null; }
  } catch {}
  if (!BOT_TOKEN) return parsedUser || { id: ADMIN_ID||'0', first_name:'Dev', username:'dev' };
  try {
    const p = new URLSearchParams(initData);
    const hash = p.get('hash'); if (!hash) return parsedUser;
    p.delete('hash');
    const dc = [...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    const tok = (BOT_TOKEN||'').trim().replace(/^["']|["']$/g,'');
    const sec = crypto.createHmac('sha256','WebAppData').update(tok).digest();
    if (crypto.createHmac('sha256',sec).update(dc).digest('hex') !== hash) return parsedUser;
    return JSON.parse(p.get('user')||'null');
  } catch { return parsedUser; }
}

const isAdmin = u => String(u.id) === String(ADMIN_ID);
const qrUrl   = (a,d) => `https://img.vietqr.io/image/${BANK_NAME}-${BANK_ACC}-qr_only.png?amount=${a}&addInfo=${d}&accountName=${encodeURIComponent(BANK_OWNER)}`;
const R       = (res,d,c=200) => res.status(c).json(d);
const ERR     = (res,m,c=400) => res.status(c).json({detail:m});

const getDiscount = (uid, sellers) => sellers[String(uid)]?.discount || 0;
const applyDiscount = (price, disc) => disc > 0 ? Math.round(price*(1-disc/100)) : price;

async function tgSend(chat_id, text) {
  if (!BOT_TOKEN || !chat_id) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({chat_id, text, parse_mode:'HTML'})
    });
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return ERR(res,'POST only',405);

  let body = {};
  try {
    if (req.body && typeof req.body==='object') { body=req.body; }
    else {
      const raw = await new Promise((ok,rej)=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>ok(d));req.on('error',rej);});
      if (raw) body = JSON.parse(raw);
    }
  } catch(e) { console.error('Body parse:',e.message); }

  const path = body._path || req.url.replace(/^\/api\/?/,'').split('/')[0] || 'me';
  const user = getUser(body.init_data);
  if (!user?.id) return ERR(res,'Unauthorized',401);
  const uid = String(user.id);
  user.first_name = user.first_name||''; user.username = user.username||'';

  // ME
  if (path==='me') {
    const [users,members,sellers] = await Promise.all([db.users.get(),db.members.get(),db.sellers.get()]);
    members[uid] = {username:user.username,first_name:user.first_name,last_name:user.last_name||''};
    await db.members.set(members);
    if (!users[uid]) { users[uid]={balance:0,total_nap:0,weekly_nap:0,monthly_nap:0}; await db.users.set(users); }
    const disc = getDiscount(uid,sellers);
    return R(res,{id:uid,first_name:user.first_name,username:user.username,balance:users[uid].balance,total_nap:users[uid].total_nap,is_seller:disc>0,seller_discount:disc,is_admin:isAdmin(user)});
  }

  // PRODUCTS
  if (path==='products') {
    const [cats,keys,sellers] = await Promise.all([db.products.get(),db.keys.get(),db.sellers.get()]);
    const disc = getDiscount(uid,sellers);
    return R(res, Object.entries(cats).map(([catId,cat])=>({
      catId, catName:cat.name,
      items:(cat.items||[]).map(item=>({
        ...item, stock:(keys[item.id]||[]).length,
        price:applyDiscount(item.price,disc), base_price:item.price, discount:disc
      }))
    })));
  }

  // TRANSACTIONS
  if (path==='transactions') {
    const all = await db.txs.get();
    return R(res, all.filter(t=>t.user_id===uid).sort((a,b)=>b.time-a.time).slice(0,30));
  }

  // TOP
  if (path==='top') {
    const [users,members] = await Promise.all([db.users.get(),db.members.get()]);
    const w=[],m=[];
    for (const [id,d] of Object.entries(users)) {
      const n=members[id]?.first_name||id;
      if(d.weekly_nap>0) w.push({uid:id,name:n,amount:d.weekly_nap});
      if(d.monthly_nap>0) m.push({uid:id,name:n,amount:d.monthly_nap});
    }
    w.sort((a,b)=>b.amount-a.amount); m.sort((a,b)=>b.amount-a.amount);
    return R(res,{week:w.slice(0,10),month:m.slice(0,10)});
  }

  // DEPOSIT
  if (path==='deposit') {
    const {action,amount,trans_id} = body;
    if (action==='create') {
      if (!amount||amount<10000) return ERR(res,'Tối thiểu 10,000đ');
      const pending=await db.pending.get();
      if (pending[uid]) return ERR(res,'Bạn đang có giao dịch chờ');
      const tid=randomBytes(4).toString('hex'), desc=`NAP_${tid}`;
      pending[uid]={trans_id:tid,amount,created_at:Date.now()};
      await db.pending.set(pending);
      const txs=await db.txs.get();
      txs.push({user_id:uid,type:'nap',amount,status:'pending',trans_id:tid,details:'',time:Date.now()/1000});
      await db.txs.set(txs);
      return R(res,{trans_id:tid,description:desc,amount,bank_name:BANK_NAME,account_number:BANK_ACC,account_name:BANK_OWNER,qr_url:qrUrl(amount,desc)});
    }
    if (action==='poll') {
      const pending=await db.pending.get(), td=pending[uid];
      if (!td||td.trans_id!==trans_id) return ERR(res,'Không tìm thấy giao dịch');
      if (Date.now()-td.created_at>300000) {
        delete pending[uid]; await db.pending.set(pending);
        const txs=await db.txs.get(), t=txs.find(x=>x.trans_id===trans_id); if(t) t.status='failed';
        await db.txs.set(txs); return R(res,{status:'timeout'});
      }
      try {
        const r=await fetch(BANK_API,{signal:AbortSignal.timeout(12000)});
        const data=await r.json(), list=Array.isArray(data)?data:(data.transactions||[]);
        let paid=false;
        for (const tx of list) {
          const d=String(tx.Description||tx.description||tx.Remark||''),cd=String(tx.CD||tx.cd||'');
          const a=parseFloat(String(tx.Amount||tx.amount||'0').replace(/,/g,''))||0;
          if((d.includes(`NAP_${trans_id}`)||d.includes(`NAP${trans_id}`))&&cd==='+'&&a>=td.amount){paid=true;break;}
        }
        if (paid) {
          delete pending[uid]; await db.pending.set(pending);
          const users=await db.users.get();
          if(!users[uid]) users[uid]={balance:0,total_nap:0,weekly_nap:0,monthly_nap:0};
          for(const k of['balance','total_nap','weekly_nap','monthly_nap']) users[uid][k]=(users[uid][k]||0)+td.amount;
          await db.users.set(users);
          const txs=await db.txs.get(), t=txs.find(x=>x.trans_id===trans_id); if(t) t.status='success';
          await db.txs.set(txs);
          await tgSend(ADMIN_ID,
            `💰 <b>NẠP TIỀN MỚI!</b>\n\n`+
            `👤 Người dùng: <b>${user.first_name}</b>\n`+
            `🆔 ID: <code>${uid}</code>\n`+
            `💵 Số tiền: <b>+${td.amount.toLocaleString('vi-VN')}đ</b>\n`+
            `💳 Số dư mới: <b>${users[uid].balance.toLocaleString('vi-VN')}đ</b>`
          );
          return R(res,{status:'success',balance:users[uid].balance});
        }
        return R(res,{status:'pending'});
      } catch { return R(res,{status:'pending'}); }
    }
    if (action==='cancel') {
      const pending=await db.pending.get();
      if(pending[uid]){const tid=pending[uid].trans_id;delete pending[uid];await db.pending.set(pending);const txs=await db.txs.get();const t=txs.find(x=>x.trans_id===tid);if(t)t.status='failed';await db.txs.set(txs);}
      return R(res,{ok:true});
    }
  }

  // BUY
  if (path==='buy') {
    const {item_id} = body;
    const [cats,keys,users,sellers,txs] = await Promise.all([db.products.get(),db.keys.get(),db.users.get(),db.sellers.get(),db.txs.get()]);
    let foundItem=null, foundCatName='';
    for (const cat of Object.values(cats)) {
      const item=(cat.items||[]).find(i=>i.id===item_id);
      if(item){foundItem=item;foundCatName=cat.name;break;}
    }
    if(!foundItem) return ERR(res,'Sản phẩm không tồn tại');
    const disc=getDiscount(uid,sellers), price=applyDiscount(foundItem.price,disc);
    const balance=users[uid]?.balance||0, tid=randomBytes(4).toString('hex').toUpperCase();
    const sellerTag=disc>0?` (Seller -${disc}%)`:'';
    if(!(keys[item_id]||[]).length){txs.push({user_id:uid,type:'mua',amount:price,status:'failed',trans_id:tid,details:'Hết key',time:Date.now()/1000});await db.txs.set(txs);return ERR(res,'Hết key');}
    if(balance<price){txs.push({user_id:uid,type:'mua',amount:price,status:'failed',trans_id:tid,details:'Không đủ số dư',time:Date.now()/1000});await db.txs.set(txs);return ERR(res,`Không đủ số dư. Cần ${price.toLocaleString('vi-VN')}đ`);}
    const key=keys[item_id].shift();
    if(!users[uid]) users[uid]={balance:0,total_nap:0,weekly_nap:0,monthly_nap:0};
    users[uid].balance-=price;
    txs.push({user_id:uid,type:'mua',amount:price,status:'success',trans_id:tid,details:`Mua ${foundItem.name}${sellerTag}`,time:Date.now()/1000});
    await Promise.all([db.keys.set(keys),db.users.set(users),db.txs.set(txs)]);
    await tgSend(ADMIN_ID,
      `🛍 <b>BÁN HÀNG MỚI!</b>\n\n`+
      `👤 Người mua: <b>${user.first_name}</b>\n`+
      `🆔 ID: <code>${uid}</code>\n`+
      `📦 Sản phẩm: <b>${foundItem.name}</b>\n`+
      `💵 Giá: <b>${price.toLocaleString('vi-VN')}đ</b>${sellerTag}\n`+
      `🔑 Key: <code>${key}</code>\n`+
      `💳 Số dư còn: <b>${users[uid].balance.toLocaleString('vi-VN')}đ</b>`
    );
    await tgSend(Number(uid),
      `🎉 <b>MUA KEY THÀNH CÔNG!</b>\n\n`+
      `📦 Mã đơn: <code>${tid}</code>\n`+
      `🔑 Key của bạn:\n<b>${key}</b>\n\n`+
      `📱 Package: <b>${foundItem.package||foundCatName}</b>\n`+
      `📅 Thời hạn: <b>${foundItem.duration||foundItem.name}</b>\n`+
      `💰 Số tiền: <b>${price.toLocaleString('vi-VN')}đ</b>\n\n`+
      `📌 <b>Hướng dẫn sử dụng:</b>\n`+
      `1. Sao chép key trên\n`+
      `2. Mở mod và nhập key để kích hoạt\n\n`+
      `🙏 Cảm ơn bạn đã tin tưởng sử dụng dịch vụ!`
    );
    return R(res,{key,balance:users[uid].balance,trans_id:tid});
  }

  // ADMIN
  if (path==='admin') {
    if(!isAdmin(user)) return ERR(res,'Forbidden',403);
    const {action,...rest} = body;

    if (action==='stats') {
      const [cats,keys,users,sellers,txs]=await Promise.all([db.products.get(),db.keys.get(),db.users.get(),db.sellers.get(),db.txs.get()]);
      let totalKeys=0; const keyStats={};
      for(const cat of Object.values(cats)) for(const item of(cat.items||[])){const c=(keys[item.id]||[]).length;keyStats[item.name]=c;totalKeys+=c;}
      return R(res,{total_categories:Object.keys(cats).length,total_keys:totalKeys,key_stats:keyStats,total_users:Object.keys(users).length,total_sellers:Object.keys(sellers).length,total_balance:Object.values(users).reduce((s,u)=>s+(u.balance||0),0),total_revenue:txs.filter(t=>t.type==='mua'&&t.status==='success').reduce((s,t)=>s+t.amount,0)});
    }
    if (action==='cat_list') return R(res,await db.products.get());
    if (action==='cat_add') {
      const cats=await db.products.get(), catId='cat_'+randomBytes(3).toString('hex');
      cats[catId]={name:rest.cat_name,items:[]}; await db.products.set(cats);
      return R(res,{catId,name:rest.cat_name});
    }
    if (action==='cat_delete') {
      const [cats,keys]=await Promise.all([db.products.get(),db.keys.get()]);
      for(const item of(cats[rest.cat_id]?.items||[])) delete keys[item.id];
      delete cats[rest.cat_id];
      await Promise.all([db.products.set(cats),db.keys.set(keys)]); return R(res,{ok:true});
    }
    if (action==='item_add') {
      const cats=await db.products.get(); if(!cats[rest.cat_id]) return ERR(res,'Danh mục không tồn tại');
      const itemId='item_'+randomBytes(3).toString('hex');
      cats[rest.cat_id].items.push({id:itemId,name:rest.name,price:Number(rest.price),duration:rest.duration||'',package:rest.pkg||''});
      await db.products.set(cats); return R(res,{itemId});
    }
    if (action==='item_edit') {
      const cats=await db.products.get(), cat=cats[rest.cat_id]; if(!cat) return ERR(res,'Danh mục không tồn tại');
      const item=cat.items.find(i=>i.id===rest.item_id); if(!item) return ERR(res,'Item không tồn tại');
      if(rest.name) item.name=rest.name; if(rest.price) item.price=Number(rest.price);
      if(rest.duration) item.duration=rest.duration; if(rest.pkg) item.package=rest.pkg;
      await db.products.set(cats); return R(res,{ok:true});
    }
    if (action==='item_delete') {
      const [cats,keys]=await Promise.all([db.products.get(),db.keys.get()]);
      if(!cats[rest.cat_id]) return ERR(res,'Danh mục không tồn tại');
      cats[rest.cat_id].items=cats[rest.cat_id].items.filter(i=>i.id!==rest.item_id);
      delete keys[rest.item_id];
      await Promise.all([db.products.set(cats),db.keys.set(keys)]); return R(res,{ok:true});
    }
    if (action==='keys_get') { const keys=await db.keys.get(); return R(res,keys[rest.item_id]||[]); }
    if (action==='keys_add') {
      const keys=await db.keys.get(); if(!keys[rest.item_id]) keys[rest.item_id]=[];
      const nk=rest.keys_text.trim().split('\n').map(k=>k.trim()).filter(Boolean);
      keys[rest.item_id].push(...nk); await db.keys.set(keys); return R(res,{added:nk.length,total:keys[rest.item_id].length});
    }
    if (action==='keys_delete') {
      const keys=await db.keys.get(); if(!keys[rest.item_id]) return ERR(res,'Không có key');
      const deleted=keys[rest.item_id].splice(rest.index,1)[0]; await db.keys.set(keys); return R(res,{deleted});
    }
    if (action==='sellers') {
      const [sellers,members]=await Promise.all([db.sellers.get(),db.members.get()]);
      return R(res,Object.entries(sellers).map(([id,s])=>({uid:id,discount:s.discount||10,name:members[id]?.first_name||id,username:members[id]?.username||''})));
    }
    if (action==='sellers_add') {
      const sid=String(rest.target_uid), disc=Number(rest.discount)||10;
      const sellers=await db.sellers.get(); sellers[sid]={discount:disc}; await db.sellers.set(sellers);
      await tgSend(Number(sid),`🎉 Bạn được cấp quyền <b>Seller</b>!\n🏪 Giảm <b>${disc}%</b> cho tất cả sản phẩm!`);
      return R(res,{ok:true});
    }
    if (action==='sellers_edit') {
      const sid=String(rest.target_uid), sellers=await db.sellers.get();
      if(!sellers[sid]) return ERR(res,'Không phải seller');
      sellers[sid].discount=Number(rest.discount)||10; await db.sellers.set(sellers); return R(res,{ok:true});
    }
    if (action==='sellers_remove') {
      const sellers=await db.sellers.get(); delete sellers[String(rest.target_uid)]; await db.sellers.set(sellers); return R(res,{ok:true});
    }
    if (action==='users') {
      const [users,members,sellers]=await Promise.all([db.users.get(),db.members.get(),db.sellers.get()]);
      return R(res,Object.entries(members).map(([id,m])=>({uid:id,name:m.first_name||id,username:m.username||'',balance:(users[id]||{}).balance||0,total_nap:(users[id]||{}).total_nap||0,is_seller:!!sellers[id],discount:sellers[id]?.discount||0})).sort((a,b)=>b.total_nap-a.total_nap));
    }
    if (action==='broadcast') {
      const members=await db.members.get(); let s=0,f=0;
      for(const id of Object.keys(members)){try{const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:Number(id),text:rest.message,parse_mode:'HTML'})});if(r.ok)s++;else f++;}catch{f++;}}
      return R(res,{success:s,fail:f});
    }
  }

  return ERR(res,'Not found',404);
}
