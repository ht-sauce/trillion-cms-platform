const base = 'http://127.0.0.1:3001/geoserver'
const SITE = '01a19b4a-0721-70c1-a31b-2e6cb70da076'
const login = await (await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123456' })
})).json()
const token = Object.values(login.data)[0]
const res = await fetch(`${base}/news-faq/rebuild?siteId=${SITE}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
})
console.log('状态：', res.status, JSON.stringify(await res.json()).slice(0, 200))
