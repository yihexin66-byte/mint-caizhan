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
		errors.push(msg.params)
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
	console.log('[' + label + ']', typeof v === 'string' ? v : JSON.stringify(v))
	return v
}
async function center(sel) {
	return await ev('center', `(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`)
}
async function touch(x, y, type) {
	await send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 2, radiusY: 2, force: 1 }] })
}
async function shot(name) {
	const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	fs.writeFileSync('_qa/' + name, Buffer.from(s.data, 'base64'))
	console.log('[shot]', name)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true })
await send('Page.navigate', { url: 'http://localhost:5173/?qa=press' + Date.now() + '#/pages/home/home' })
await nap(3800)

// tab press: find the records tab (2nd .tab-item)
for (const [label, sel] of [['tab', '.tab-item:nth-child(2)'], ['row', '.tx-row']]) {
	if (label === 'row') {
		// switch to records first
		const tab = JSON.parse(await center('.tab-item:nth-child(2)'))
		await touch(tab.x, tab.y, 'touchStart')
		await nap(250)
		await touch(tab.x, tab.y, 'touchEnd')
		await nap(1400)
		await ev('now-at', 'location.hash')
	}
	const c = await center(sel)
	if (!c) { console.log('no target', sel); continue }
	const p = JSON.parse(c)
	await touch(p.x, p.y, 'touchStart')
	await nap(180)
	await ev('pressed-state-' + label, `(() => { const e = document.querySelector('${sel}'); if (!e) return null; const cs = getComputedStyle(e); const inner = ${label === 'row' ? "document.querySelector('.tx-row')" : "document.querySelector('.tab-item:nth-child(2)')"}; return JSON.stringify({ cls: e.className, opacity: getComputedStyle(inner).opacity, transform: getComputedStyle(inner).transform }); })()`)
	await shot('v6-press-' + label + '.png')
	await touch(p.x, p.y, 'touchEnd')
	await nap(label === 'tab' ? 1600 : 1600)
	await ev('after-release-' + label, 'location.hash')
}

await ev('final', 'location.hash')
console.log('exceptions:', errors.length)
ws.close()
process.exit(0)
