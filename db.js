// lib/db.js — Upstash Redis
// Env cần set: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function get(key, fallback) {
  const v = await redis.get(key);
  return v ?? fallback;
}
async function set(key, value) {
  await redis.set(key, value);
}

export const getKeys          = () => get('keys_db',         { fluorite_1d: [], fluorite_7d: [], fluorite_31d: [] });
export const saveKeys         = (v) => set('keys_db', v);

export const getUsers         = () => get('users_db',        {});
export const saveUsers        = (v) => set('users_db', v);

export const getMembers       = () => get('members_db',      {});
export const saveMembers      = (v) => set('members_db', v);

export const getTransactions  = () => get('transactions_db', []);
export const saveTransactions = (v) => set('transactions_db', v);

export const getSellers       = () => get('sellers_db',      []);
export const saveSellers      = (v) => set('sellers_db', v);

export const getPending       = () => get('pending_tx',      {});
export const savePending      = (v) => set('pending_tx', v);
