export async function onRequestGet() {
  const channels = [
    {
      id: 'pmc',
      name: 'PMC Music HD',
      nameFa: 'شبکه موسیقی پی‌ام‌سی',
      category: 'Persian Pop / Music Video',
      streamUrl: 'https://pmcrohls.wns.live/hls/stream.m3u8',
      description: 'پخش زنده ۲۴ ساعته برترین موزیک ویدیوهای فارسی و روز جهان با کیفیت فول اچ‌دی',
      quality: '1080p HD',
      badge: 'محبوب‌ترین',
    },
    {
      id: 'radiojavan',
      name: 'Radio Javan TV',
      nameFa: 'رادیو جوان تی‌وی',
      category: 'Persian Pop & HipHop',
      streamUrl: 'https://rjtvhls.wns.live/hls/stream.m3u8',
      description: 'شبکه رسمی تصویری رادیو جوان؛ ویدیوکلیپ‌های انحصاری پاپ، رپ و برنامه‌های سرگرمی',
      quality: '1080p HD',
      badge: 'اختصاصی',
    },
    {
      id: 'deluxe',
      name: 'Deluxe Music TV',
      nameFa: 'دلوکس موزیک اروپا',
      category: 'European Pop / Electronic',
      streamUrl: 'https://sdn-global-live-streaming-packager-cache.3qsdn.com/13456/13456_264_live.m3u8',
      description: 'معروف‌ترین شبکه تلویزیونی موسیقی بدون توقف آلمان و اروپا با صدای دالبی و تصویر شفاف',
      quality: '720p HD',
      badge: 'بین‌المللی',
    },
    {
      id: 'avafamily',
      name: 'AVA Family / Music',
      nameFa: 'شبکه آوا فمیلی',
      category: 'Entertainment / Music',
      streamUrl: 'https://familyhls.avatv.live/hls/stream.m3u8',
      description: 'پخش زنده برنامه‌های تفریحی، سریال‌ها و موسیقی فارسی',
      quality: '720p HD',
    },
  ];

  return new Response(JSON.stringify({ channels }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
