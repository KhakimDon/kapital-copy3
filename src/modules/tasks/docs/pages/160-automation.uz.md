# Avtomatlashtirish

Doska takrorlanadigan ishlarni o'zi bajara oladi. **Avtomatlashtirish** — kod yozmasdan tuziladigan qoidalar. Ular *[Proyekt sozlamalari](page:settings) → **Avtomatlashtirish*** bo'limida turadi; qoidalarni proyekt egasi/admin tuzadi.

Har bir qoida uch qismdan iborat:

- **QACHON** (trigger) — qoida qaysi hodisada ishga tushadi;
- **AGAR** (shartlar) — ixtiyoriy filtrlar;
- **UNDA** (amallar) — nima qilinishi kerak.

## Qoida yaratish

1. Proyekt sozlamalarida **Avtomatlashtirish** bo'limini toping va **Qoida** tugmasini bosing.
2. Qoida nomini yozing.
3. **Qachon** — triggerni tanlang:
   - **Yaratilganda** — yangi vazifa paydo bo'lganda (ixtiyoriy: qaysi ustunda);
   - **Ko'chirilganda** — karta ustundan ustunga o'tganda; **Qayerdan** va **Qayerga** ustunlarini belgilash mumkin (yoki «Har qanday»);
   - **Tayinlanganda** — mas'ul o'zgarganda;
   - **Muhimlik o'zgarganda** — ixtiyoriy: qaysi yangi muhimlikda;
   - **Izoh yozilganda** — vazifaga izoh qo'shilganda.
4. **Agar** — kerak bo'lsa shart qo'shing: maydon (**Muhimlik**, **Ustun**, **Turi**, **Mas'ul**, **Yorliq**, **Sarlavha**) + shart (**teng**, **teng emas**, **bo'sh**, **bo'sh emas**, **o'z ichiga oladi**) + qiymat. Bir nechta shart bo'lsa, hammasi bajarilishi kerak.
5. **Unda** — bir yoki bir nechta amal qo'shing:
   - **Ustunga ko'chirish** — kartani tanlangan ustunga o'tkazadi;
   - **Mas'ul tayinlash** — tanlangan foydalanuvchiga, **Muallifga** yoki **Olib tashlash**;
   - **Muhimlikni o'zgartirish**;
   - **Yorliq qo'shish** / **Yorliqni olib tashlash**;
   - **Muddatni surish** — muddatni ko'rsatilgan kunga suradi;
   - **Izoh yozish** — shablon bo'yicha avtomatik izoh;
   - **Kuzatuvchilarga xabar** — kuzatuvchilarga [bildirishnoma](page:notifications) yuboradi;
   - **Telegram xabari** — [ulangan Telegram guruhiga](page:telegram) shablonli xabar.
6. **Saqlash** ni bosing.

Izoh va Telegram shablonlarida o'rinbosarlar ishlaydi: `{{title}}` — vazifa sarlavhasi, `{{actor}}` — amalni bajargan foydalanuvchi, `{{priority}}` — muhimlik.

## Yoqish va o'chirish

Ro'yxatdagi har bir qoidaning chap tomonida tumbler bor — qoidani o'chirmasdan vaqtincha to'xtatib qo'yish mumkin. Qalam belgisi tahrirlaydi, savatcha o'chiradi.

## Misollar

- **«Done»ga ko'chirilganda** → **Izoh yozish**: `{{actor}} vazifani yakunladi` + **Telegram xabari**.
- **Yaratilganda**, agar **Mas'ul bo'sh** → **Muallifga** tayinlash.
- **Muhimlik o'zgarganda** (yangi muhimlik: Shoshilinch) → **Yorliq qo'shish**: `urgent` + **Kuzatuvchilarga xabar**.

> Qoidalar ilova ichidagi o'zgarishlarda ham, [AI (MCP) orqali](page:connect) qilingan o'zgarishlarda ham ishlaydi. Bir qoidaning amali boshqa qoidani ishga tushirishi mumkin — zanjir ko'pi bilan 3 qadam davom etadi.

---

**Aloqador sahifalar:** [Proyekt sozlamalari](page:settings) · [Telegram xabarnomalar](page:telegram) · [Bildirishnomalar](page:notifications)
