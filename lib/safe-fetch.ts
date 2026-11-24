import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Fetching a URL the user (or a search result) gave us, without letting it reach
// anything inside our own network: https only, public addresses only, bounded
// redirects, size and time.

function isPrivateAddress(addr: string): boolean {
  if (addr.includes(':')) {
    const a = addr.toLowerCase()
    return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80') || a.startsWith('::ffff:')
  }
  const [a, b] = addr.split('.').map(Number)
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Not a valid link') }
  if (url.protocol !== 'https:') throw new Error('Only https images can be used')
  if (url.port && url.port !== '443') throw new Error('That link can’t be used')
  const host = url.hostname
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || isIP(host)) throw new Error('That link can’t be used')
  const addrs = await lookup(host, { all: true })
  if (addrs.length === 0 || addrs.some(a => isPrivateAddress(a.address))) throw new Error('That link can’t be used')
  return url
}

/** Download an image, following up to 3 redirects, checking every hop. */
export async function fetchImageSafely(raw: string, maxBytes = 6 * 1024 * 1024): Promise<Buffer> {
  let current = raw
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicHttps(current)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        Referer: url.origin + '/',
      },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString()
      continue
    }
    if (!res.ok) throw new Error('That image couldn’t be downloaded — try another one')
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/') || type.includes('svg')) throw new Error('That link isn’t a usable image')
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > maxBytes) throw new Error('That image is too large')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > maxBytes) throw new Error('That image is too large')
    return buf
  }
  throw new Error('Too many redirects')
}
