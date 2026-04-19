export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/'], // بنمنع جوجل يدخل على لوحة التحكم أو ملفات الـ API
    },
    sitemap: 'https://www.windeg.com/sitemap.xml',
  }
}