'use strict'

/**
 * Mint 云端账本（uniCloud 云对象）。
 *
 * 安全模型：
 * - 微信 AppSecret 只存放在本目录 config.js，客户端永远拿不到。
 * - 客户端通过 wx.login 的 code 换取 openid，服务端签发 HMAC 会话 token。
 * - 所有数据读写都以 token 中的 openid 作为隔离条件。
 * - 数据库集合禁止客户端直连，只允许云对象访问。
 */

const crypto = require('crypto')
const config = require('./config.js')

const C = config.COLLECTIONS
const db = uniCloud.database()

const INCOME_CATEGORIES = ['salary', 'bonus', 'invest', 'other_income', 'debt_receive']
const EXPENSE_CATEGORIES = [
  'food', 'transport', 'shopping', 'bills', 'entertainment', 'health',
  'education', 'living', 'gift', 'travel', 'other_expense', 'debt_pay'
]
const BUDGET_CATEGORIES = [
  'food', 'transport', 'shopping', 'bills', 'entertainment', 'health',
  'education', 'living', 'gift', 'travel', 'other_expense'
]
const CURRENCY_CODES = config.DEFAULT_RATES.map((item) => item.currency)

function fail (message, code) {
  const error = new Error(message)
  error.code = code || 'MINT_ERROR'
  throw error
}

function now () {
  return Date.now()
}

function cleanText (value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function validateAmount (value) {
  const amount = Number(value)
  if (!isFinite(amount) || amount <= 0 || amount > 1000000000000) {
    fail('金额不合法', 'INVALID_AMOUNT')
  }
  return Math.round(amount * 100) / 100
}

function validateCurrency (value) {
  const code = cleanText(value, 8).toUpperCase()
  if (CURRENCY_CODES.indexOf(code) < 0) fail('币种不合法', 'INVALID_CURRENCY')
  return code
}

function validateTimestamp (value, label) {
  const ts = Number(value)
  if (!isFinite(ts) || ts <= 0 || ts > 4102444800000) {
    fail((label || '日期') + '不合法', 'INVALID_DATE')
  }
  return Math.floor(ts)
}

function validateCategory (type, value) {
  const id = cleanText(value, 40)
  if (type === 'income' && INCOME_CATEGORIES.indexOf(id) >= 0) return id
  if (type === 'expense' && EXPENSE_CATEGORIES.indexOf(id) >= 0) return id
  fail('分类不合法', 'INVALID_CATEGORY')
}

function tokenSecret () {
  const secret = config.TOKEN_SECRET || ''
  if (secret.length < 16 || secret.indexOf('CHANGE_ME') === 0) {
    fail('云端 TOKEN_SECRET 未配置，请查看 README 的云函数配置说明', 'CONFIG_MISSING')
  }
  return secret
}

function base64url (input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signToken (openid) {
  const payload = {
    o: openid,
    e: Math.floor(now() / 1000) + Number(config.TOKEN_TTL_SECONDS || 2592000)
  }
  const body = base64url(JSON.stringify(payload))
  const signature = crypto.createHmac('sha256', tokenSecret()).update(body).digest('base64url')
  return body + '.' + signature
}

function verifyToken (token) {
  if (typeof token !== 'string' || token.length === 0) {
    fail('请先登录', 'UNAUTHORIZED')
  }
  const parts = token.split('.')
  if (parts.length !== 2) fail('登录信息无效，请重新登录', 'UNAUTHORIZED')

  const body = parts[0]
  const expected = crypto.createHmac('sha256', tokenSecret()).update(body).digest('base64url')
  const given = Buffer.from(parts[1])
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    fail('登录信息无效，请重新登录', 'UNAUTHORIZED')
  }

  let payload = null
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch (e) {
    fail('登录信息无效，请重新登录', 'UNAUTHORIZED')
  }
  if (payload == null || typeof payload.o !== 'string' || payload.o.length === 0) {
    fail('登录信息无效，请重新登录', 'UNAUTHORIZED')
  }
  if (typeof payload.e !== 'number' || payload.e * 1000 < now()) {
    fail('登录已过期，请重新登录', 'TOKEN_EXPIRED')
  }
  return payload.o
}

function mapUser (row) {
  return {
    id: row._id,
    nickname: row.nickname || '',
    avatar: row.avatar || ''
  }
}

function mapTransaction (row) {
  return {
    id: row._id,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    categoryId: row.categoryId,
    note: row.note || '',
    date: row.date,
    sourceDebtId: row.sourceDebtId || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapDebt (row) {
  return {
    id: row._id,
    direction: row.direction,
    counterparty: row.counterparty,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.dueDate,
    note: row.note || '',
    settled: row.settled === true,
    settledAt: row.settledAt || 0,
    linkedTxId: row.linkedTxId || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapBudget (row) {
  return {
    id: row._id,
    categoryId: row.categoryId,
    amount: row.amount,
    currency: row.currency,
    alertAt: row.alertAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapSettings (row) {
  return {
    locale: row.locale === 'en' ? 'en' : 'zh',
    baseCurrency: row.baseCurrency || config.DEFAULT_BASE_CURRENCY,
    rates: normalizeRates(row.rates),
    notifyWechat: row.notifyWechat === true
  }
}

function normalizeRates (input) {
  const map = {}
  for (let i = 0; i < config.DEFAULT_RATES.length; i++) {
    map[config.DEFAULT_RATES[i].currency] = config.DEFAULT_RATES[i].rateCny
  }
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      const item = input[i]
      if (item == null) continue
      const code = cleanText(item.currency, 8).toUpperCase()
      const rate = Number(item.rateCny)
      if (CURRENCY_CODES.indexOf(code) >= 0 && isFinite(rate) && rate > 0 && rate <= 1000000) {
        map[code] = rate
      }
    }
  }
  const result = []
  for (let i = 0; i < config.DEFAULT_RATES.length; i++) {
    const code = config.DEFAULT_RATES[i].currency
    result.push({
      currency: code,
      rateCny: code === 'CNY' ? 1 : map[code]
    })
  }
  return result
}

async function findOne (collection, where) {
  const res = await db.collection(collection).where(where).limit(1).get()
  return res.data && res.data.length > 0 ? res.data[0] : null
}

async function ensureSettings (openid) {
  let settings = await findOne(C.settings, { openid: openid })
  if (settings != null) return settings

  const ts = now()
  const doc = {
    openid: openid,
    locale: config.DEFAULT_LOCALE,
    baseCurrency: config.DEFAULT_BASE_CURRENCY,
    rates: normalizeRates(config.DEFAULT_RATES),
    notifyWechat: false,
    subscription: {
      templateId: '',
      accepted: false,
      updatedAt: 0
    },
    createdAt: ts,
    updatedAt: ts
  }
  try {
    const added = await db.collection(C.settings).add(doc)
    doc._id = added.id
    return doc
  } catch (e) {
    // 并发首次登录时可能撞上唯一索引，重新读取即可。
    settings = await findOne(C.settings, { openid: openid })
    if (settings != null) return settings
    throw e
  }
}

async function wechatSession (code) {
  if (!config.APP_SECRET || config.APP_SECRET.length < 10) {
    fail('云端尚未配置微信 AppSecret，请查看 README 后重新部署 mint-core', 'CONFIG_MISSING')
  }
  let res = null
  try {
    res = await uniCloud.httpclient.request('https://api.weixin.qq.com/sns/jscode2session', {
      method: 'GET',
      data: {
        appid: config.APP_ID,
        secret: config.APP_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      },
      dataType: 'json',
      timeout: 10000
    })
  } catch (e) {
    fail('无法连接微信登录服务，请稍后重试', 'WECHAT_NETWORK')
  }
  const data = res && res.data ? res.data : {}
  if (data.errcode) {
    fail('微信登录失败：' + (data.errmsg || ('错误码 ' + data.errcode)), 'WECHAT_LOGIN')
  }
  if (typeof data.openid !== 'string' || data.openid.length === 0) {
    fail('微信登录失败，请稍后重试', 'WECHAT_LOGIN')
  }
  return data
}

async function findBudgetByCategory (openid, categoryId, excludeId) {
  const res = await db.collection(C.budgets).where({ openid: openid, categoryId: categoryId }).limit(5).get()
  const list = res.data || []
  for (let i = 0; i < list.length; i++) {
    if (!excludeId || list[i]._id !== excludeId) return list[i]
  }
  return null
}

module.exports = {
  async login (code) {
    const jsCode = cleanText(code, 128)
    if (jsCode.length === 0) fail('缺少微信登录凭证', 'INVALID_CODE')

    const session = await wechatSession(jsCode)
    const openid = session.openid
    const ts = now()
    let user = await findOne(C.users, { openid: openid })
    let isNewUser = false

    if (user == null) {
      const doc = {
        openid: openid,
        nickname: '',
        avatar: '',
        createdAt: ts,
        lastLoginAt: ts,
        updatedAt: ts
      }
      const added = await db.collection(C.users).add(doc)
      doc._id = added.id
      user = doc
      isNewUser = true
    } else {
      await db.collection(C.users).doc(user._id).update({
        lastLoginAt: ts,
        updatedAt: ts
      })
    }

    await ensureSettings(openid)

    return {
      token: signToken(openid),
      user: mapUser(user),
      isNewUser: isNewUser
    }
  },

  async updateProfile (token, input) {
    const openid = verifyToken(token)
    const data = input || {}
    const nickname = cleanText(data.nickname, 16)
    const avatar = cleanText(data.avatar, 512)
    if (avatar.length > 0 && avatar.indexOf('cloud://') !== 0 && avatar.indexOf('https://') !== 0) {
      fail('头像地址不合法', 'INVALID_AVATAR')
    }

    const user = await findOne(C.users, { openid: openid })
    if (user == null) fail('用户不存在，请重新登录', 'NOT_FOUND')

    await db.collection(C.users).doc(user._id).update({
      nickname: nickname,
      avatar: avatar,
      updatedAt: now()
    })

    return {
      id: user._id,
      nickname: nickname,
      avatar: avatar
    }
  },

  async latestRates (token) {
    verifyToken(token)
    const targets = CURRENCY_CODES.filter((code) => code !== 'CNY')
    const query = targets.join(',')
    const sources = [
      'https://api.frankfurter.dev/v1/latest?from=CNY&to=' + query,
      'https://api.frankfurter.app/latest?from=CNY&to=' + query,
      'https://open.er-api.com/v6/latest/CNY'
    ]

    let payload = null
    let sourceLabel = ''
    for (let i = 0; i < sources.length; i++) {
      try {
        const res = await uniCloud.httpclient.request(sources[i], {
          method: 'GET',
          dataType: 'json',
          timeout: 10000
        })
        const body = res && res.data ? res.data : null
        if (body == null || typeof body !== 'object') continue
        const quotes = body.rates && typeof body.rates === 'object' ? body.rates : null
        if (quotes == null) continue
        let complete = true
        for (let j = 0; j < targets.length; j++) {
          const quote = Number(quotes[targets[j]])
          if (!isFinite(quote) || quote <= 0) {
            complete = false
            break
          }
        }
        if (!complete) continue
        payload = body
        sourceLabel = i < 2 ? 'Frankfurter / ECB' : 'ExchangeRate-API'
        break
      } catch (e) {
        // 继续尝试下一个免费数据源
      }
    }
    if (payload == null) {
      fail('暂时无法获取最新汇率，请检查网络后重试', 'RATES_UNAVAILABLE')
    }

    const quotes = payload.rates
    const rates = [{ currency: 'CNY', rateCny: 1 }]
    for (let i = 0; i < targets.length; i++) {
      const code = targets[i]
      const value = 1 / Number(quotes[code])
      rates.push({
        currency: code,
        rateCny: Math.round(value * 1000000) / 1000000
      })
    }

    const stamp = payload.date || payload.time_last_update_utc || ''
    return {
      source: sourceLabel,
      date: cleanText(String(stamp), 40),
      fetchedAt: now(),
      rates: rates
    }
  },

  async bootstrap (token) {
    const openid = verifyToken(token)
    const settings = await ensureSettings(openid)

    const results = await Promise.all([
      db.collection(C.transactions).where({ openid: openid }).orderBy('date', 'desc').limit(2000).get(),
      db.collection(C.debts).where({ openid: openid }).orderBy('createdAt', 'desc').limit(500).get(),
      db.collection(C.budgets).where({ openid: openid }).limit(200).get()
    ])

    const transactions = (results[0].data || []).map(mapTransaction)
    const debts = (results[1].data || []).map(mapDebt)
    const budgets = (results[2].data || []).map(mapBudget)

    return {
      transactions: transactions,
      debts: debts,
      budgets: budgets,
      settings: mapSettings(settings)
    }
  },

  async saveTransaction (token, input) {
    const openid = verifyToken(token)
    const data = input || {}
    const type = data.type === 'income' ? 'income' : (data.type === 'expense' ? 'expense' : '')
    if (type.length === 0) fail('收支类型不合法', 'INVALID_TYPE')

    const amount = validateAmount(data.amount)
    const currency = validateCurrency(data.currency)
    const categoryId = validateCategory(type, data.categoryId)
    const note = cleanText(data.note, 200)
    const date = validateTimestamp(data.date, '日期')
    const id = cleanText(data.id, 64)
    const ts = now()

    if (id.length > 0) {
      const existing = await findOne(C.transactions, { _id: id, openid: openid })
      if (existing == null) fail('记录不存在或无权修改', 'NOT_FOUND')
      if (existing.sourceDebtId) fail('由往来结清生成的记录不能修改', 'LINKED_TX')

      await db.collection(C.transactions).doc(id).update({
        type: type,
        amount: amount,
        currency: currency,
        categoryId: categoryId,
        note: note,
        date: date,
        updatedAt: ts
      })

      return mapTransaction(Object.assign({}, existing, {
        type: type,
        amount: amount,
        currency: currency,
        categoryId: categoryId,
        note: note,
        date: date,
        updatedAt: ts
      }))
    }

    const doc = {
      openid: openid,
      type: type,
      amount: amount,
      currency: currency,
      categoryId: categoryId,
      note: note,
      date: date,
      sourceDebtId: '',
      createdAt: ts,
      updatedAt: ts
    }
    const added = await db.collection(C.transactions).add(doc)
    doc._id = added.id
    return mapTransaction(doc)
  },

  async deleteTransaction (token, id) {
    const openid = verifyToken(token)
    const targetId = cleanText(id, 64)
    const existing = await findOne(C.transactions, { _id: targetId, openid: openid })
    if (existing == null) fail('记录不存在或无权删除', 'NOT_FOUND')
    if (existing.sourceDebtId) fail('由往来结清生成的记录不能删除', 'LINKED_TX')

    await db.collection(C.transactions).doc(targetId).remove()
    return { ok: true }
  },

  async saveBudget (token, input) {
    const openid = verifyToken(token)
    const data = input || {}
    const categoryId = cleanText(data.categoryId, 40)
    if (categoryId !== 'all' && BUDGET_CATEGORIES.indexOf(categoryId) < 0) {
      fail('预算分类不合法', 'INVALID_CATEGORY')
    }
    const amount = validateAmount(data.amount)
    const currency = validateCurrency(data.currency)
    const alertValue = Number(data.alertAt)
    const alertAt = isFinite(alertValue) && alertValue > 0 && alertValue <= 100
      ? Math.round(alertValue)
      : 80
    const id = cleanText(data.id, 64)
    const ts = now()

    let existing = null
    if (id.length > 0) {
      existing = await findOne(C.budgets, { _id: id, openid: openid })
      if (existing == null) fail('预算不存在或无权修改', 'NOT_FOUND')
      const duplicate = await findBudgetByCategory(openid, categoryId, id)
      if (duplicate != null) fail('该分类已经设置过预算', 'DUPLICATE_BUDGET')
      await db.collection(C.budgets).doc(id).update({
        categoryId: categoryId,
        amount: amount,
        currency: currency,
        alertAt: alertAt,
        updatedAt: ts
      })
      return mapBudget(Object.assign({}, existing, {
        categoryId: categoryId,
        amount: amount,
        currency: currency,
        alertAt: alertAt,
        updatedAt: ts
      }))
    }

    existing = await findBudgetByCategory(openid, categoryId, '')
    if (existing != null) {
      await db.collection(C.budgets).doc(existing._id).update({
        amount: amount,
        currency: currency,
        alertAt: alertAt,
        updatedAt: ts
      })
      return mapBudget(Object.assign({}, existing, {
        amount: amount,
        currency: currency,
        alertAt: alertAt,
        updatedAt: ts
      }))
    }

    const doc = {
      openid: openid,
      categoryId: categoryId,
      amount: amount,
      currency: currency,
      alertAt: alertAt,
      createdAt: ts,
      updatedAt: ts
    }
    const added = await db.collection(C.budgets).add(doc)
    doc._id = added.id
    return mapBudget(doc)
  },

  async deleteBudget (token, id) {
    const openid = verifyToken(token)
    const targetId = cleanText(id, 64)
    const existing = await findOne(C.budgets, { _id: targetId, openid: openid })
    if (existing == null) fail('预算不存在或无权删除', 'NOT_FOUND')

    await db.collection(C.budgets).doc(targetId).remove()
    return { ok: true }
  },

  async saveDebt (token, input) {
    const openid = verifyToken(token)
    const data = input || {}
    const direction = data.direction === 'receivable'
      ? 'receivable'
      : (data.direction === 'payable' ? 'payable' : '')
    if (direction.length === 0) fail('往来方向不合法', 'INVALID_DIRECTION')

    const counterparty = cleanText(data.counterparty, 40)
    if (counterparty.length === 0) fail('请填写往来对象', 'INVALID_COUNTERPARTY')
    const amount = validateAmount(data.amount)
    const currency = validateCurrency(data.currency)
    const dueDate = validateTimestamp(data.dueDate, '到期日')
    const note = cleanText(data.note, 200)
    const id = cleanText(data.id, 64)
    const ts = now()

    if (id.length > 0) {
      const existing = await findOne(C.debts, { _id: id, openid: openid })
      if (existing == null) fail('往来不存在或无权修改', 'NOT_FOUND')
      if (existing.settled === true) fail('已结清的往来不能修改', 'DEBT_SETTLED')

      await db.collection(C.debts).doc(id).update({
        direction: direction,
        counterparty: counterparty,
        amount: amount,
        currency: currency,
        dueDate: dueDate,
        note: note,
        updatedAt: ts
      })

      return mapDebt(Object.assign({}, existing, {
        direction: direction,
        counterparty: counterparty,
        amount: amount,
        currency: currency,
        dueDate: dueDate,
        note: note,
        updatedAt: ts
      }))
    }

    const doc = {
      openid: openid,
      direction: direction,
      counterparty: counterparty,
      amount: amount,
      currency: currency,
      dueDate: dueDate,
      note: note,
      settled: false,
      settledAt: 0,
      linkedTxId: '',
      createdAt: ts,
      updatedAt: ts
    }
    const added = await db.collection(C.debts).add(doc)
    doc._id = added.id
    return mapDebt(doc)
  },

  async settleDebt (token, id) {
    const openid = verifyToken(token)
    const targetId = cleanText(id, 64)
    const debt = await findOne(C.debts, { _id: targetId, openid: openid })
    if (debt == null) fail('往来不存在或无权操作', 'NOT_FOUND')
    if (debt.settled === true) fail('该往来已经结清', 'DEBT_SETTLED')

    const settings = await ensureSettings(openid)
    const ts = now()
    const isReceivable = debt.direction === 'receivable'
    const type = isReceivable ? 'income' : 'expense'
    const categoryId = isReceivable ? 'debt_receive' : 'debt_pay'
    const prefix = settings.locale === 'en'
      ? (isReceivable ? 'Received · ' : 'Settled · ')
      : (isReceivable ? '收回 · ' : '结清 · ')

    const txDoc = {
      openid: openid,
      type: type,
      amount: debt.amount,
      currency: debt.currency,
      categoryId: categoryId,
      note: prefix + debt.counterparty,
      date: ts,
      sourceDebtId: debt._id,
      createdAt: ts,
      updatedAt: ts
    }
    const added = await db.collection(C.transactions).add(txDoc)
    txDoc._id = added.id

    // 乐观并发保护：只有仍未结清的记录才能更新成功，避免重复生成收支。
    const updateRes = await db.collection(C.debts).doc(targetId).update({
      settled: true,
      settledAt: ts,
      linkedTxId: added.id,
      updatedAt: ts
    })
    if (!updateRes || updateRes.updated === 0) {
      await db.collection(C.transactions).doc(added.id).remove()
      fail('结清失败，请刷新后重试', 'SETTLE_CONFLICT')
    }

    const updatedDebt = Object.assign({}, debt, {
      settled: true,
      settledAt: ts,
      linkedTxId: added.id,
      updatedAt: ts
    })

    return {
      debt: mapDebt(updatedDebt),
      transaction: mapTransaction(txDoc)
    }
  },

  async deleteDebt (token, id) {
    const openid = verifyToken(token)
    const targetId = cleanText(id, 64)
    const existing = await findOne(C.debts, { _id: targetId, openid: openid })
    if (existing == null) fail('往来不存在或无权删除', 'NOT_FOUND')
    if (existing.settled === true) fail('已结清的往来不能删除', 'DEBT_SETTLED')

    await db.collection(C.debts).doc(targetId).remove()
    return { ok: true }
  },

  async saveSettings (token, input) {
    const openid = verifyToken(token)
    const settings = await ensureSettings(openid)
    const data = input || {}
    const locale = data.locale === 'en' ? 'en' : 'zh'
    const baseCurrency = validateCurrency(data.baseCurrency)
    const rates = normalizeRates(data.rates)
    const notifyWechat = data.notifyWechat === true
    const ts = now()

    await db.collection(C.settings).doc(settings._id).update({
      locale: locale,
      baseCurrency: baseCurrency,
      rates: rates,
      notifyWechat: notifyWechat,
      updatedAt: ts
    })

    return {
      locale: locale,
      baseCurrency: baseCurrency,
      rates: rates,
      notifyWechat: notifyWechat
    }
  },

  async registerSubscription (token, templateId, accepted) {
    const openid = verifyToken(token)
    const template = cleanText(templateId, 128)
    if (!config.SUBSCRIBE_TEMPLATE_ID) {
      return { ok: false, reason: 'TEMPLATE_NOT_CONFIGURED' }
    }
    if (template !== config.SUBSCRIBE_TEMPLATE_ID) {
      fail('订阅消息模板不匹配，请检查 constants/config.uts 与云端 config.js', 'TEMPLATE_MISMATCH')
    }

    const settings = await ensureSettings(openid)
    const ts = now()
    const value = accepted === true
    await db.collection(C.settings).doc(settings._id).update({
      notifyWechat: value,
      subscription: {
        templateId: template,
        accepted: value,
        updatedAt: ts
      },
      updatedAt: ts
    })
    return { ok: true }
  }
}
