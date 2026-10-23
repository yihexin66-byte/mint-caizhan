import fs from 'node:fs'

const list = await (await fetch('http://localhost:9222/json/list')).json()
const page = list.find(t => t.type === 'page')
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
		errors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300))
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
	if (r.exceptionDetails) console.log('[' + label + '] EXC', JSON.stringify(r.exceptionDetails).slice(0, 300))
	console.log('[' + label + ']', typeof v === 'string' ? v : JSON.stringify(v))
	return v
}
async function shot(name) {
	const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	fs.writeFileSync('_qa/' + name, Buffer.from(s.data, 'base64'))
	console.log('[shot]', name)
}
async function go(hash) {
	await ev('go ' + hash, `location.hash='${hash}'; 'ok'`)
	await nap(1600)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true })
await send('Page.navigate', { url: 'http://localhost:5173/?qa=v8final' + Date.now() + '#/pages/shell/shell' })
await nap(3200)

// final rates demo: no auto dialog, manual shows demo toast
await ev('clear-check', `localStorage.removeItem('mint_rates_check_day'); 'ok'`)
await go('#/pages/rates/rates')
await ev('auto-dialog-final', `document.querySelector('.quote-dialog') ? 'OPEN' : 'CLOSED'`)
await ev('live-title', `(() => { const e=document.querySelector('.live-title'); return e ? e.innerText : 'MISS'; })()`)
await shot('v8-final-rates.png')
await ev('click-live', `(() => { const e=document.querySelector('.live-row'); e && e.click(); return e ? 'OK' : 'MISS'; })()`)
await nap(600)
await ev('demo-toast', `(() => { const e=document.querySelector('.uni-toast'); return e ? e.innerText : 'no-toast'; })()`)
await shot('v8-final-rates-demo-toast.png')

await go('#/pages/debts/debts')
await ev('debts-title', `document.body.innerText.slice(0, 80).replace(/\\n/g,' | ')`)
await shot('v8-final-debts.png')

await go('#/pages/record-edit/record-edit')
await ev('record-edit-title', `document.body.innerText.slice(0, 80).replace(/\\n/g,' | ')`)
await shot('v8-final-record-edit.png')

await go('#/pages/debt-edit/debt-edit')
await ev('debt-edit-title', `document.body.innerText.slice(0, 80).replace(/\\n/g,' | ')`)
await shot('v8-final-debt-edit.png')

await go('#/pages/login/login')
await ev('login-title', `document.body.innerText.slice(0, 120).replace(/\\n/g,' | ')`)
await shot('v8-final-login.png')

console.log('[exceptions]', errors.length)
if (errors.length) console.log(errors.slice(0, 8).join('\n---\n'))
ws.close()
