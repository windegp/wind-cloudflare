export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/'], // بنمنع جوجل يدخل على لوحة التحكم أو ملفات الـ API
    },
    sitemap: 'https://windeg.com/sitemap.xml',
  }
}