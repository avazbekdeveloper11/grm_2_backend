# Gilam Yuvish — Backend API

Node.js + Express + SQLite bilan yozilgan REST API.

## Ishga tushirish

```bash
npm install
cp .env.example .env   # .env faylini to'ldiring
npm start
```

## Muhit o'zgaruvchilari (.env)

| Kalit | Tavsif | Standart |
|-------|--------|---------|
| `PORT` | Server porti | `3000` |
| `JWT_SECRET` | JWT imzolash kaliti | `gilam_secret_key_change_this` |
| `DATABASE_PATH` | SQLite fayl yo'li | `./gilam.db` |

## API endpointlar

### Auth
- `POST /api/login` — tizimga kirish

### Foydalanuvchilar (admin)
- `GET /api/users?role=worker|driver` — ro'yxat
- `POST /api/users` — qo'shish (login/parol avtomatik)
- `PUT /api/users/:id/activate` — faollashtirish
- `DELETE /api/users/:id` — o'chirish

### Buyurtmalar
- `GET /api/orders` — ro'yxat
- `POST /api/orders` — yaratish
- `PUT /api/orders/:id` — yangilash
- `DELETE /api/orders/:id` — o'chirish
- `POST /api/orders/:id/carpets` — gilam o'lchamlari
- `GET /api/orders/:id/carpets` — o'lchamlarni olish

### Sozlamalar
- `GET /api/settings` — sozlamalarni olish
- `PUT /api/settings` — yangilash (price_per_sqm)

## Texnik talablar

- Node.js >= 22 (node:sqlite uchun)
- Railway yoki Render da deploy qilish mumkin

## Standart foydalanuvchilar

| Login | Parol | Rol |
|-------|-------|-----|
| admin | admin123 | Admin |
| usta1–usta4 | 1234 | Ishchi |
| haydovchi1–2 | 1234 | Haydovchi |
