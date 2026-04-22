// lib/db.js — Vercel KV wrapper
// Cài: npm i @vercel/kv

import { kv } from '@vercel/kv';

// ── KEYS ─────────────────────────────────────────────────────────────────────
export async function getKeys() {
  const data = await kv.get('keys_db');
  return data || { fluorite_1d: [], fluorite_7d: [], fluorite_31d: [] };
}
export async function saveKeys(db) {
  await kv.set('keys_db', db);
}

// ── USERS ─────────────────────────────────────────────────────────────────────
export async function getUsers() {
  return (await kv.get('users_db')) || {};
}
export async function saveUsers(db) {
  await kv.set('users_db', db);
}

// ── MEMBERS ───────────────────────────────────────────────────────────────────
export async function getMembers() {
  return (await kv.get('members_db')) || {};
}
export async function saveMembers(db) {
  await kv.set('members_db', db);
}

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────
export async function getTransactions() {
  return (await kv.get('transactions_db')) || [];
}
export async function saveTransactions(db) {
  await kv.set('transactions_db', db);
}

// ── SELLERS ───────────────────────────────────────────────────────────────────
export async function getSellers() {
  return (await kv.get('sellers_db')) || [];
}
export async function saveSellers(db) {
  await kv.set('sellers_db', db);
}

// ── PENDING ───────────────────────────────────────────────────────────────────
export async function getPending() {
  return (await kv.get('pending_tx')) || {};
}
export async function savePending(db) {
  await kv.set('pending_tx', db);
}
