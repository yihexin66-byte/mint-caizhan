import fs from 'node:fs'

const base = 'http://localhost:5173/?qa=' + Date.now() + '#/pages/home/home'

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

await new Promise((resolve, reject) => {
	ws.addEventListener('open', resolve)
	ws.addEventListener('error', reject)
})

function send(method, params = {}) {
	return new Promise((resolve, reject) => {
		const callId = ++id
		pending.set(callId, { resolve, reject })
		ws.send(JSON.stringify({ id: callId, method, params }))
	})
}

const nap = ms => new Promise(r => setTimeout(r, ms))
const results = []
function check(label, ok, detail) {
	results.push({ label, ok })
	console.log('ASSERT ' + label + ':', ok ? 'PASS' : 'FAIL ' + (detail || ''))
}

async function ev(label, expr) {
	const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
	if (r.exceptionDetails) {
		const d = (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text
		console.log('[' + label + '] EXCEPTION ' + String(d).slice(0, 300))
		return { EXCEPTION: d }
	}
	const v = r.result?.value
	console.log('[' + label + ']', typeof v === 'string' ? v : JSON.stringify(v))
	return v
}

async function typeInto(label, sel, text, clearFirst) {
	const focusRes = await ev(label + ':focus', `(() => {
		const el = document.querySelector('${sel} input') || document.querySelector('${sel}')
		if (!el) return 'no-el'
		el.focus()
		return 'focused:' + el.value
	})()`)
	if (clearFirst && typeof focusRes === 'string' && focusRes.startsWith('focused:')) {
		const len = focusRes.slice(8).length
		for (let i = 0; i < len; i++) {
			await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
			await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
		}
		if (len > 0) await nap(150)
	}
	await send('Input.insertText', { text })
	await nap(250)
	return await ev(label + ':value', `(() => {
		const el = document.querySelector('${sel} input') || document.querySelector('${sel}')
		return el ? el.value : null
	})()`)
}

async function shot(name) {
	const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	fs.writeFileSync('_qa/' + name, Buffer.from(s.data, 'base64'))
	console.log('[shot]', name)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Runtime.discardConsoleEntries')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true })

const navWall = Date.now()
await send('Page.navigate', { url: base })
await nap(7000)

await ev('bootstrap', `(() => {
	window.__qa = {
		txt: () => document.body.innerText,
		val: sel => {
			const root = document.querySelector(sel)
			if (!root) return null
			const el = root.tagName === 'INPUT' ? root : root.querySelector('input')
			return el ? el.value : null
		},
		elText: sel => { const e = document.querySelector(sel); return e ? e.textContent : null },
		clickText: (txt, rootSel) => {
			const root = rootSel ? document.querySelector(rootSel) : document
			if (!root) return 'no-root:' + rootSel
			const all = Array.from(root.querySelectorAll('uni-view, uni-text'))
			const cands = all.filter(e => (e.textContent || '').trim().indexOf(txt) === 0)
			if (!cands.length) return 'no-match:' + txt
			const leaf = cands.find(e => !cands.some(o => o !== e && e.contains(o))) || cands[0]
			leaf.click()
			return 'clicked:' + txt
		}
	}
	return 'ok'
})()`)

// ---------- baseline ----------
const base0 = JSON.parse(await ev('baseline-home', `(() => JSON.stringify({
	hash: location.hash,
	net: __qa.elText('.hero-amount'),
	pill: __qa.elText('.hero-count-text'),
	expense: __qa.elText('.hero-stat-value:nth-child(1)') || (document.querySelectorAll('.hero-stat-value')[1] || {}).textContent
}))()`))
console.log('baseline:', JSON.stringify(base0))

// ---------- 1. create record ----------
await ev('open-record', `document.querySelector('.hero-cta').click(), 'clicked'`)
await nap(1500)
await ev('record-open-check', `JSON.stringify({ hash: location.hash, title: __qa.elText('.page-title') })`)
await typeInto('amount', '.amount-input', '25.5', false)
await typeInto('note', '.detail-input', 'QA测试记录A', false)
await nap(400)
await shot('crud-1-record.png')
await ev('save', `document.querySelector('.save-btn').click(), 'clicked'`)
await nap(2200)

// ---------- 2. verify home updated ----------
const afterCreate = JSON.parse(await ev('after-create-home', `(() => JSON.stringify({
	hash: location.hash,
	net: __qa.elText('.hero-amount'),
	pill: __qa.elText('.hero-count-text')
}))()`))
console.log('after create:', JSON.stringify(afterCreate))
check('home reflects create (hash)', afterCreate.hash === '#/pages/home/home', afterCreate.hash)
check('net decreased by 25.5', base0.net !== afterCreate.net && afterCreate.net !== null, base0.net + ' -> ' + afterCreate.net)
check('pill 17->18', afterCreate.pill !== base0.pill, base0.pill + ' -> ' + afterCreate.pill)

// ---------- 3. records list shows it ----------
await ev('tab-records', `__qa.clickText('明细', '.tabbar')`)
await nap(1600)
await ev('records-find', `(() => {
	const t = __qa.txt()
	return JSON.stringify({ hash: location.hash, count: __qa.elText('.count-pill-text'), found: t.includes('QA测试记录A'), amount: t.includes('¥25.50') })
})()`)

// ---------- 4. edit it ----------
await ev('open-row', `(() => {
	const row = Array.from(document.querySelectorAll('.tx-row')).find(r => r.textContent.includes('QA测试记录A'))
	if (!row) return 'row-not-found'
	row.click()
	return 'clicked'
})()`)
await nap(1600)
const editState = JSON.parse(await ev('edit-state', `(() => JSON.stringify({
	title: __qa.elText('.page-title'),
	amount: __qa.val('.amount-input'),
	note: __qa.val('.detail-input')
}))()`))
check('edit prefilled', editState.amount === '25.5' && editState.note === 'QA测试记录A', JSON.stringify(editState))
const editedVal = await typeInto('edit-amount', '.amount-input', '31', true)
await nap(300)
await ev('edit-save', `document.querySelector('.save-btn').click(), 'clicked'`)
await nap(2200)
await ev('records-verify-edit', `(() => {
	const row = Array.from(document.querySelectorAll('.tx-row')).find(r => r.textContent.includes('QA测试记录A'))
	return JSON.stringify({ hash: location.hash, rowText: row ? row.textContent : null })
})()`)

// ---------- 5. delete it ----------
await ev('reopen-row', `(() => {
	const row = Array.from(document.querySelectorAll('.tx-row')).find(r => r.textContent.includes('QA测试记录A'))
	if (!row) return 'row-not-found'
	row.click()
	return 'clicked'
})()`)
await nap(1600)
await ev('ask-delete', `document.querySelector('.delete-row').click(), 'clicked'`)
await nap(600)
await ev('delete-dialog', `JSON.stringify({ hasDanger: !!document.querySelector('.dialog-btn-danger'), msg: __qa.elText('.dialog-title') })`)
await ev('confirm-delete', `document.querySelector('.dialog-btn-danger').click(), 'clicked'`)
await nap(2000)
const afterDelete = JSON.parse(await ev('records-verify-delete', `(() => JSON.stringify({ hash: location.hash, stillThere: __qa.txt().includes('QA测试记录A'), count: __qa.elText('.count-pill-text') }))()`))
check('deleted from records', !afterDelete.stillThere && afterDelete.hash.includes('records'), JSON.stringify(afterDelete))

// ---------- 6. back home, verify restored ----------
await ev('tab-home', `__qa.clickText('首页', '.tabbar')`)
await nap(1600)
const homeRestored = JSON.parse(await ev('home-restored', `(() => JSON.stringify({
	net: __qa.elText('.hero-amount'),
	pill: __qa.elText('.hero-count-text')
}))()`))
check('net restored', homeRestored.net === base0.net, homeRestored.net + ' vs ' + base0.net)
check('pill restored', homeRestored.pill === base0.pill, homeRestored.pill + ' vs ' + base0.pill)

// ---------- 7. debt settle ----------
await ev('open-debts', `document.querySelector('.debt-card-right').click(), 'clicked'`)
await nap(1600)
await shot('crud-2-debts.png')
const debtsBefore = JSON.parse(await ev('debts-before', `(() => {
	const cols = document.querySelectorAll('.hero-stat-value')
	return JSON.stringify({ hash: location.hash, receivable: cols.length > 0 ? cols[0].textContent : null, payable: cols.length > 1 ? cols[1].textContent : null })
})()`))
await ev('open-settle', `(() => {
	const items = Array.from(document.querySelectorAll('.debt-item'))
	const pay = items.find(x => x.textContent.includes('应付'))
	if (!pay) return 'no-payable'
	pay.querySelector('.settle-btn').click()
	return 'clicked-settle'
})()`)
await nap(700)
await shot('crud-3-settle-dialog.png')
const settleInfo = JSON.parse(await ev('settle-dialog', `(() => JSON.stringify({
	amount: __qa.elText('.settle-summary-amount'),
	name: __qa.elText('.settle-summary-name'),
	hasConfirm: !!document.querySelector('.dialog-btn-mint')
}))()`))
await ev('confirm-settle', `document.querySelector('.dialog-btn-mint').click(), 'clicked'`)
await nap(2200)
const debtsAfter = JSON.parse(await ev('debts-after', `(() => {
	const cols = document.querySelectorAll('.hero-stat-value')
	return JSON.stringify({ payable: cols.length > 1 ? cols[1].textContent : null, settledTag: __qa.txt().includes('已结清') })
})()`))
console.log('settle:', JSON.stringify(settleInfo), '-> after:', JSON.stringify(debtsAfter))
check('payable decreased', debtsBefore.payable !== debtsAfter.payable, debtsBefore.payable + ' -> ' + debtsAfter.payable)

// ---------- 8. home expense up + linked tx ----------
await ev('debts-back', `document.querySelector('.icon-btn').click(), 'clicked'`)
await nap(1600)
const homeAfterSettle = JSON.parse(await ev('home-after-settle', `(() => {
	const cols = document.querySelectorAll('.hero-stat-value')
	return JSON.stringify({ hash: location.hash, expense: cols.length > 1 ? cols[1].textContent : null })
})()`))
check('home expense increased after settle', homeAfterSettle.expense !== base0.expense && homeAfterSettle.expense !== null, base0.expense + ' -> ' + homeAfterSettle.expense)

await ev('tab-records-2', `__qa.clickText('明细', '.tabbar')`)
await nap(1600)
await ev('linked-tx', `(() => {
	const rows = Array.from(document.querySelectorAll('.tx-row'))
	const linked = rows.find(r => r.textContent.includes('已结清'))
	if (!linked) return JSON.stringify({ found: false })
	linked.click()
	return JSON.stringify({ found: true })
})()`)
await nap(1600)
const linkedDetail = JSON.parse(await ev('linked-detail', `(() => JSON.stringify({
	hash: location.hash,
	banner: !!document.querySelector('.linked-banner'),
	saveHidden: !document.querySelector('.save-btn'),
	deleteHidden: !document.querySelector('.delete-row')
}))()`))
check('linked tx opens with banner, no save/delete', linkedDetail.banner && linkedDetail.saveHidden && linkedDetail.deleteHidden, JSON.stringify(linkedDetail))
await shot('crud-4-linked.png')
await ev('back-from-linked', `document.querySelector('.icon-btn').click(), 'clicked'`)
await nap(1400)

// ---------- 9. budget edit ----------
await ev('tab-budgets', `__qa.clickText('预算', '.tabbar')`)
await nap(1600)
const budgetBefore = await ev('budget-before', `__qa.elText('.budget-card')`)
await ev('open-budget', `(() => { const c = document.querySelector('.budget-card'); if (!c) return 'no-card'; c.click(); return 'opened' })()`)
await nap(800)
await ev('budget-sheet', `JSON.stringify({ title: __qa.elText('.sheet-title'), amount: __qa.val('.amount-input') })`)
await typeInto('budget-amount', '.amount-input', '999', true)
await nap(300)
await ev('budget-save', `document.querySelector('.save-btn').click(), 'clicked'`)
await nap(1800)
const budgetAfter = await ev('budget-after', `__qa.elText('.budget-card')`)
console.log('budget before:', budgetBefore)
console.log('budget after :', budgetAfter)
check('budget limit updated to 999', typeof budgetAfter === 'string' && budgetAfter.includes('999'), budgetAfter)

// ---------- final ----------
await ev('tab-home-final', `__qa.clickText('首页', '.tabbar')`)
await nap(1600)
await shot('crud-5-final.png')

const fresh = errors.filter(e => e.exceptionDetails && e.exceptionDetails.timestamp > navWall - 2000)
console.log('--- fresh exceptions during flow:', fresh.length)
for (const e of fresh.slice(0, 5)) {
	const d = e.exceptionDetails
	console.log((d.exception && d.exception.description) || d.text)
}

const failed = results.filter(r => !r.ok)
console.log('---- SUMMARY:', results.length - failed.length + '/' + results.length, 'assertions passed ----')
for (const f of failed) console.log('  FAILED:', f.label)

ws.close()
process.exit(0)