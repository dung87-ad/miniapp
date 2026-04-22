// lib/auth.js
import crypto from 'crypto';

const BOT_TOKEN  = process.env.BOT_TOKEN;
export const ADMIN_ID   = process.env.ADMIN_ID;

export function verifyTelegram(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheck = entries.map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const expected = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
    if (expected !== hash) return null;
    return JSON.parse(params.get('user') || '{}');
  } catch { return null; }
}

export function getUser(initData) {
  // Dev mode: skip verify if BOT_TOKEN not set
  if (!BOT_TOKEN) {
    return { id: ADMIN_ID || '12345', first_name: 'Dev', username: 'dev' };
  }
  return verifyTelegram(initData);
}

export function requireAdmin(user) {
  return String(user.id) === String(ADMIN_ID);
}
