# استریم موزیک به تلگرام با GitHub Actions

## چطور کار می‌کنه
- موزیک‌های خام رو داخل `music/` می‌ریزی.
- ورک‌فلو **Optimize Music** را دستی اجرا می‌کنی.
- فایل‌ها به AAC 96kbps تبدیل و در `music-optimized/` ذخیره می‌شوند.
- فایل‌های خام پس از موفقیتِ پردازش حذف می‌شوند.
- ورک‌فلو **Stream to Telegram** را دستی اجرا می‌کنی.
- استریم تا وقتی Workflow را Cancel کنی ادامه دارد و در صورت قطع اتصال، خودکار reconnect می‌شود.

## راه‌اندازی اولیه

در **Settings → Secrets and variables → Actions** این دو Repository Secret را بساز:

- `GSTREAM_RTMPS_URL` — لینک کامل RTMPS گروه
- `CSTREAM_RTMPS_URL` — لینک کامل RTMPS کانال

مقدار Secretها در لاگ‌ها چاپ نمی‌شود. نام Secretها عمداً جداست تا بتوانی هنگام اجرای Workflow مقصد را انتخاب کنی.

## نحوه استفاده

### ۱. آپلود موزیک
فایل‌های خام را در `music/` قرار بده و commit/push کن.

### ۲. بهینه‌سازی
از تب **Actions → Optimize Music → Run workflow** اجرا کن.

فایل‌های صوتی به AAC با مشخصات 96kbps / 44.1kHz / stereo تبدیل می‌شوند. اگر خروجی هم‌نام از قبل وجود داشته باشد دوباره تبدیل نمی‌شود.

### ۳. شروع استریم
از **Actions → Stream to Telegram → Run workflow** مقصد را انتخاب کن:
- `channel` برای `CSTREAM_RTMPS_URL`
- `group` برای `GSTREAM_RTMPS_URL`

سپس استریم زنده را در مقصد تلگرام روشن کن.

### ۴. قطع استریم
اجرای Workflow را باز کن و **Cancel workflow** بزن. اسکریپت با signal مناسب متوقف می‌شود.

## محدودیت‌ها
- هر اجرای GitHub Actions حداکثر ۳۵۰ دقیقه timeout دارد.
- هیچ cron یا اجرای زمان‌بندی‌شده‌ای در پروژه وجود ندارد؛ همه چیز دستی است.
- IPهای GitHub Actions ممکن است در برخی شرایط توسط سرویس مقصد محدود شوند.
- فایل‌های موسیقی خام و بهینه‌شده برای این پروژه داخل Git نگهداری می‌شوند؛ برای فایل‌های بسیار بزرگ بهتر است محدودیت حجم GitHub را در نظر بگیری.

## تنظیمات فنی
- کیفیت صدا: در `.github/workflows/optimize.yml` مقدار `-b:a 96k`.
- تصویر: `assets/background.jpg` یک تصویر مشکی 640×360 است و قابل جایگزینی است.
- ویدیو: 2fps با bitrate حدود 80kbps برای مصرف پایین CPU و پهنای‌باند انتخاب شده.
- صدای خروجی در استریم re-encode نمی‌شود و با `-c:a copy` ارسال می‌شود.
- Playlist به‌صورت مرتب‌شده از `music-optimized/` ساخته می‌شود.

## ساختار

```
.github/workflows/optimize.yml
.github/workflows/stream.yml
music/.gitkeep
music-optimized/.gitkeep
assets/background.jpg
scripts/build_playlist.sh
scripts/make_background.sh
.gitignore
README.md
```
