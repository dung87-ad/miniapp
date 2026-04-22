// lib/helpers.js

export const PRODUCTS = {
  fluorite_1d:  { name: 'Fluorite iOS 1 Ngày',  price: 90000  },
  fluorite_7d:  { name: 'Fluorite iOS 7 Ngày',  price: 190000 },
  fluorite_31d: { name: 'Fluorite iOS 31 Ngày', price: 280000 },
};

export const BANK_NAME    = 'VietComBank';
export const BANK_ACC     = process.env.BANK_ACCOUNT || '1066207939';
export const BANK_OWNER   = process.env.BANK_OWNER   || 'NGUYEN DUC DUNG';
export const BANK_API_URL = process.env.BANK_API_URL || 'https://thueapibank.vn/historyapivcb/63c6637751cc3746b6b3a3e8585fec9e';

export function qrUrl(amount, desc) {
  return `https://img.vietqr.io/image/${BANK_NAME}-${BANK_ACC}-qr_only.png?amount=${amount}&addInfo=${desc}&accountName=${encodeURIComponent(BANK_OWNER)}`;
}

export function getPrice(uid, prodId, sellers) {
  const base = PRODUCTS[prodId]?.price || 0;
  return sellers.includes(String(uid)) ? Math.floor(base * 0.9) : base;
}

export function isSeller(uid, sellers) {
  return sellers.includes(String(uid));
}

export async function notifyAdmin(adminId, text, botToken) {
  if (!botToken || !adminId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: adminId, text, parse_mode: 'HTML' }),
    });
  } catch {}
}

export function ok(res, data) {
  return res.status(200).json(data);
}
export function err(res, msg, code = 400) {
  return res.status(code).json({ detail: msg });
}
