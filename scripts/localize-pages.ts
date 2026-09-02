// Post-build: emit /es/, /pt/ and /fr/ copies of dist/index.html with localized
// <title>, description, Open Graph tags, <html lang> and hreflang links, plus a
// sitemap listing every locale. Asset URLs are absolute (Vite `base`), so the
// copies work from a subfolder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { en } from '../src/i18n/en.ts'
import { es } from '../src/i18n/es.ts'
import { pt } from '../src/i18n/pt.ts'
import { fr } from '../src/i18n/fr.ts'

const SITE = 'https://ketbome.github.io/alphaveil/'
const locales = { en: { dict: en, og: 'en_US' }, es: { dict: es, og: 'es_ES' }, pt: { dict: pt, og: 'pt_BR' }, fr: { dict: fr, og: 'fr_FR' } } as const
type Lang = keyof typeof locales

const url = (lang: Lang) => (lang === 'en' ? SITE : `${SITE}${lang}/`)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const hreflang = [
  ...(Object.keys(locales) as Lang[]).map((l) => `    <link rel="alternate" hreflang="${l}" href="${url(l)}" />`),
  `    <link rel="alternate" hreflang="x-default" href="${SITE}" />`,
].join('\n')

const base = readFileSync('dist/index.html', 'utf8')

function localize(lang: Lang) {
  const { dict, og } = locales[lang]
  const title = esc(dict.seo.title)
  const desc = esc(dict.seo.description)
  let html = base
    .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url(lang)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url(lang)}$2`)
    .replace(/<meta property="og:locale" content="[^"]*" \/>/, `<meta property="og:locale" content="${og}" />`)
    .replace(/<meta property="og:locale:alternate"[^>]*>\s*/g, '')
    .replace('<meta property="og:locale"', `${(Object.keys(locales) as Lang[]).filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${locales[l].og}" />`).join('\n    ')}\n    <meta property="og:locale"`)
    .replace(/<link rel="alternate" hreflang[^>]*>\s*/g, '')
    .replace('<link rel="canonical"', `${hreflang.trim()}\n    <link rel="canonical"`)
  html = html.replace(/("description": ")[^"]*(")/, `$1${desc}$2`)
  return html
}

for (const lang of Object.keys(locales) as Lang[]) {
  const dir = lang === 'en' ? 'dist' : `dist/${lang}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/index.html`, localize(lang))
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${(Object.keys(locales) as Lang[]).map((lang) => `  <url>
    <loc>${url(lang)}</loc>
${(Object.keys(locales) as Lang[]).map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${url(l)}" />`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}" />
    <changefreq>monthly</changefreq>
    <priority>${lang === 'en' ? '1.0' : '0.9'}</priority>
  </url>`).join('\n')}
</urlset>
`
writeFileSync('dist/sitemap.xml', sitemap)
console.log('localized pages: en, es, pt, fr + sitemap')
