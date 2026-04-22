# Fluorite Shop — Vercel Deploy Guide

## Cấu trúc
```
vercel-app/
├── api/
│   ├── me.js
│   ├── products.js
│   ├── deposit.js
│   ├── buy.js
│   ├── transactions.js
│   ├── top.js
│   └── admin.js
├── lib/
│   ├── db.js
│   ├── auth.js
│   └── helpers.js
├── public/
│   └── index.html
├── package.json
└── vercel.json
```

## Bước 1 — Tạo Vercel KV

1. Vào https://vercel.com → project → **Storage** → **Create KV**
2. Connect KV vào project

## Bước 2 — Set Environment Variables

Vào project → **Settings** → **Environment Variables**, thêm:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | Token bot Telegram của bạn |
| `ADMIN_ID` | Telegram ID của bạn (8202216330) |
| `BANK_ACCOUNT` | 1066207939 |
| `BANK_OWNER` | NGUYEN DUC DUNG |
| `BANK_API_URL` | https://thueapibank.vn/historyapivcb/63c6637751cc3746b6b3a3e8585fec9e |

## Bước 3 — Deploy

### Option A: GitHub (khuyên dùng)
1. Push toàn bộ folder lên GitHub repo
2. Vercel → **New Project** → chọn repo → Framework: **Other** → Deploy

### Option B: Vercel CLI
```bash
npm i -g vercel
cd vercel-app
vercel --prod
```

## Bước 4 — Set Telegram WebApp URL

Sau khi deploy xong, lấy URL (vd: `https://fluorite-shop.vercel.app`) rồi:

1. Nhắn BotFather: `/setmenubutton`
2. Chọn bot → nhập URL → nhập tên nút (vd: "Mở Shop")

Hoặc dùng bot.py đơn giản đính kèm.

## Lưu ý

- Vercel KV free tier: 30MB storage, 30,000 requests/ngày — đủ dùng
- Mini App **bắt buộc HTTPS** — Vercel tự có HTTPS ✅
- Data lưu trên KV, không mất khi redeploy
