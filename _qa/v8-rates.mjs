// 汇率弹层/确认/缓存流程走查。
// 注意：正式代码在 Web 演示模式不请求实时汇率；本脚本 2026-10-20 运行时曾临时向
// pages/rates/rates.uvue 的 demo-token 分支注入同结构 snapshot，跑完后已还原源码。
// 如需重跑，请先恢复该临时注入并重新 publish web。
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
	if (r.exceptionDetails) console.log('[' + label + '] EXC', JSON.stringify(r.exceptionDetails).slice(0, 400))
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

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true })

// start from shell and clear cache keys
await send('Page.navigate', { url: 'http://localhost:5173/?qa=v8rates' + Date.now() + '#/pages/shell/shell' })
await nap(2500)
await ev('clear-cache', `(() => { localStorage.removeItem('mint_rates_check_day'); localStorage.removeItem('mint_rates_meta'); return Object.keys(localStorage).filter(k => k.indexOf('mint_rates') == 0); })()`)
await ev('go-rates', `location.hash='#/pages/rates/rates'; 'ok'`)
await nap(1800)

await ev('auto-dialog', `(() => { const d=document.querySelector('.quote-dialog'); return d ? 'OPEN' : 'CLOSED'; })()`)
await ev('quote-rows', `(() => [...document.querySelectorAll('.quote-row')].map(r => r.innerText.replace(/\\n/g, ' ')).join(' / '))()`)
await ev('quote-meta', `(() => { const e=document.querySelector('.quote-source'); return e ? e.innerText : 'MISS'; })()`)
await shot('v8-rates-auto-quote.png')

// later -> no change
await click('.quote-dialog .dialog-btn-ghost')
await nap(500)
await ev('closed-after-later', `document.querySelector('.quote-dialog') ? 'OPEN' : 'CLOSED'`)
await ev('row-usd-before', `(() => { const r=document.querySelector('.quote-row'); return document.querySelectorAll('.rate-row, .rate-item').length; })()`)
await shot('v8-rates-after-later.png')

// manual refresh -> opens again
await click('.live-row')
await nap(800)
await ev('manual-dialog', `document.querySelector('.quote-dialog') ? 'OPEN' : 'CLOSED'`)
await shot('v8-rates-manual-quote.png')

// apply
await click('.quote-dialog .dialog-btn-mint')
await nap(900)
await ev('closed-after-apply', `document.querySelector('.quote-dialog') ? 'OPEN' : 'CLOSED'`)
await ev('meta-after-apply', `(() => { const e=document.querySelector('.live-sub'); return e ? e.innerText : 'MISS'; })()`)
await ev('storage-after-apply', `JSON.stringify({ meta: localStorage.getItem('mint_rates_meta'), day: localStorage.getItem('mint_rates_check_day') })`)
await ev('rate-inputs', `(() => [...document.querySelectorAll('.rate-input input')].map(i => i.value).join(' , '))()`)
await shot('v8-rates-applied.png')

// leave and return same day: auto refresh should be skipped
await ev('go-shell', `location.hash='#/pages/shell/shell'; 'ok'`)
await nap(1200)
await ev('go-rates-again', `location.hash='#/pages/rates/rates'; 'ok'`)
await nap(1600)
await ev('same-day-dialog', `document.querySelector('.quote-dialog') ? 'OPEN' : 'CLOSED'`)
await shot('v8-rates-same-day.png')

// manual refresh still works on same day
await click('.live-row')
await nap(700)
await ev('manual-same-day-dialog', `document.querySelector('.quote-dialog') ? 'OPEN' : 'CLOSED'`)
await shot('v8-rates-manual-same-day.png')
await click('.quote-dialog .dialog-btn-ghost')

// reset the fixture rates to defaults via reset dialog (checks meta clears)
await click('.reset-row')
await nap(400)
await ev('reset-dialog', `document.querySelector('.dialog') ? 'OPEN' : 'CLOSED'`)
await shot('v8-rates-reset-dialog.png')
await click('.dialog-btn-dark')
await nap(800)
await ev('meta-after-reset', `(() => { const e=document.querySelector('.live-sub'); return e ? e.innerText : 'MISS'; })()`)
await shot('v8-rates-reset.png')

console.log('[exceptions]', errors.length)
if (errors.length) console.log(errors.slice(0, 6).join('\n---\n'))
ws.close()
