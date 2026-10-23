import fs from 'node:fs'

const list = await (await fetch('http://localhost:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
if (!page) throw new Error('no page target')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', e => {
	const msg = JSON.parse(e.data)
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id)
		pending.delete(msg.id)
		if (msg.error) reject(new Error(JSON.stringify(msg.error)))
		else resolve(msg.result)
	} else if (msg.method === 'Runtime.exceptionThrown') {
		errors.push(JSON.stringify(msg.params.exceptionDetails))
	} else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
		errors.push(msg.params.entry.text)
	}
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
function send(method, params = {}) {
	return new Promise((resolve, reject) => {
		const callId = ++id
		pending.set(callId, { resolve, reject })
		ws.send(JSON.stringify({ id: callId, method, params }))
	})
}
const nap = ms => new Promise(r => setTimeout(r, ms))
async function ev(label, expr) {
	const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
	const v = r.result?.value
	if (r.exceptionDetails) console.log('[' + label + '] EXC', JSON.stringify(r.exceptionDetails).slice(0, 500))
	console.log('[' + label + ']', typeof v === 'string' ? v : JSON.stringify(v))
	return v
}
async function shot(name) {
	const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	fs.writeFileSync('_qa/' + name, Buffer.from(s.data, 'base64'))
	console.log('[shot]', name)
}
async function click(sel) {
	return await ev('click ' + sel, `(() => { const e = document.querySelector('${sel}'); if (!e) return 'MISS'; e.click(); return 'OK'; })()`)
}
async function text(sel) {
	return await ev('text ' + sel, `(() => { const e = document.querySelector('${sel}'); return e ? (e.innerText || '').replace(/\\n/g, ' | ').slice(0, 300) : 'MISS'; })()`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true })
await send('Page.navigate', { url: 'http://localhost:5173/?qa=v8a' + Date.now() + '#/pages/shell/shell' })
await nap(3500)

await ev('hash', 'location.hash')
await ev('shells', `document.querySelectorAll('.shell').length`)
await ev('tabbar', `document.querySelectorAll('.tabbar').length`)
await ev('aurora', `document.querySelectorAll('.aurora, .aurora-bg, [class*=aurora]').length`)
await ev('home-greeting', `(() => { const e = document.querySelector('.greeting, .hello, .home-greeting'); return e ? e.innerText : (document.body.innerText.slice(0, 200)); })()`)
await shot('v8-home.png')

// rapid tab switching while observing DOM persistence + screenshot sampling
const tabSelectors = ['.tab-item:nth-child(2)', '.tab-item:nth-child(4)', '.tab-item:nth-child(5)', '.tab-item:nth-child(1)']
const labels = ['records', 'stats', 'budgets', 'home']
for (let i = 0; i < tabSelectors.length; i++) {
	await click(tabSelectors[i])
	await nap(45)
	const frame1 = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	await nap(60)
	const frame2 = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	await nap(240)
	const persist = await ev('persist-' + labels[i], `JSON.stringify({ tabbar: document.querySelectorAll('.tabbar').length, aurora: document.querySelectorAll('[class*=aurora]').length, status: document.querySelectorAll('.status-spacer').length, view: document.querySelectorAll('.tab-view').length, active: (document.querySelector('.nav-label-active')||{}).innerText || '' })`)
	console.log('[persist-' + labels[i] + ']', persist)
	if (i === 0) {
		fs.writeFileSync('_qa/v8-switch-45ms.png', Buffer.from(frame1.data, 'base64'))
		fs.writeFileSync('_qa/v8-switch-105ms.png', Buffer.from(frame2.data, 'base64'))
	}
	await nap(450)
	await shot('v8-tab-' + labels[i] + '.png')
}

await ev('exceptions', errors.length)
if (errors.length) console.log(errors.slice(0, 5).join('\n---\n'))
ws.close()
