'use strict'

/**
 * mint-notify：预算提醒定时器云函数。
 *
 * 触发方式：package.json 中的 timer 触发器（默认每天 09:00，北京时间）。
 * 逻辑与小程序端 budgets 页保持一致：
 *   本月支出（expense）按用户汇率折算到预算币种 → 使用率 >= alertAt（默认 80%）→ 推送。
 * 去重：mint-alert-log 集合（openid + monthKey + budgetId 唯一索引），每月每个预算最多一条。
 *
 * 也可以手动触发：在 HBuilderX 中右键本函数「上传并运行」即可立即执行一次。
 */

const config = require('./config.js')

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send'
const HOUR = 3600 * 1000

const CATEGORY_NAMES = {
  all: { zh: '本月总预算', en: 'Total budget' },
  food: { zh: '餐饮', en: 'Food' },
  transport: { zh: '交通', en: 'Transport' },
  shopping: { zh: '购物', en: 'Shopping' },
  bills: { zh: '账单', en: 'Bills' },
  entertainment: { zh: '娱乐', en: 'Fun' },
  health: { zh: '健康', en: 'Health' },
  education: { zh: '学习', en: 'Learning' },
  living: { zh: '居住', en: 'Living' },
  gift: { zh: '礼物', en: 'Gifts' },
  travel: { zh: '旅行', en: 'Travel' },
  other_expense: { zh: '其他', en: 'Other' },
  debt_pay: { zh: '还欠款', en: 'Debt paid' }
}

function monthRange (nowMs) {
  const shanghai = new Date(nowMs + 8 * HOUR)
  const year = shanghai.getUTCFullYear()
  const month = shanghai.getUTCMonth()
  const start = Date.UTC(year, month, 1) - 8 * HOUR
  const end = Date.UTC(year, month + 1, 1) - 8 * HOUR
  const monthKey = year + '-' + (month + 1 < 10 ? '0' : '') + (month + 1)
  return { start: start, end: end, monthKey: monthKey }
}

function rateMap (settings) {
  const map = { CNY: 1 }
  const list = settings != null && Array.isArray(settings.rates) && settings.rates.length > 0
    ? settings.rates
    : config.DEFAULT_RATES
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item != null && typeof item.currency === 'string' && isFinite(item.rateCny) && item.rateCny > 0) {
      map[item.currency] = item.rateCny
    }
  }
  return map
}

function categoryLabel (categoryId, locale) {
  const item = CATEGORY_NAMES[categoryId]
  if (item == null) return locale === 'en' ? 'Budget' : '预算'
  return locale === 'en' ? item.en : item.zh
}

function moneyText (value, currency) {
  const fixed = (Math.round(value * 100) / 100).toFixed(2)
  return (currency === 'CNY' ? '\u00A5' : currency + ' ') + fixed
}

function truncate (text, max) {
  return text.length > max ? text.substring(0, max) : text
}

/** 与小程序端 budgetSpent 完全一致的折算口径。 */
function spentFor (budget, txs, rates) {
  let total = 0
  const toRate = rates[budget.currency] || 1
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i]
    if (budget.categoryId !== 'all' && tx.categoryId !== budget.categoryId) continue
    const fromRate = rates[tx.currency] || 1
    const amount = Number(tx.amount)
    if (!isFinite(amount) || amount <= 0) continue
    total += amount * fromRate / toRate
  }
  return total
}

async function fetchAccessToken () {
  const res = await uniCloud.httpclient.request(TOKEN_URL, {
    method: 'GET',
    data: {
      grant_type: 'client_credential',
      appid: config.APP_ID,
      secret: config.APP_SECRET
    },
    dataType: 'json',
    timeout: 10000
  })
  const body = res != null ? res.data : null
  if (body == null || typeof body.access_token !== 'string') {
    return { ok: false, detail: body }
  }
  return { ok: true, token: body.access_token }
}

async function sendSubscribeMessage (accessToken, settings, budget, spent) {
  const keys = config.SUBSCRIBE_DATA_KEYS
  const locale = settings.locale === 'en' ? 'en' : 'zh'
  const data = {}
  data[keys.title] = { value: truncate(config.ALERT_TITLE, 20) }
  data[keys.category] = { value: truncate(categoryLabel(budget.categoryId, locale), 20) }
  data[keys.spent] = { value: moneyText(spent, budget.currency) }
  data[keys.limit] = { value: moneyText(Number(budget.amount), budget.currency) }

  const res = await uniCloud.httpclient.request(SEND_URL + '?access_token=' + accessToken, {
    method: 'POST',
    contentType: 'json',
    data: {
      touser: settings.openid,
      template_id: config.SUBSCRIBE_TEMPLATE_ID,
      page: config.SUBSCRIBE_PAGE,
      data: data
    },
    dataType: 'json',
    timeout: 10000
  })
  const body = res != null ? res.data : null
  if (body != null && body.errcode === 0) return { ok: true }
  return { ok: false, errcode: body != null ? body.errcode : -1, errmsg: body != null ? body.errmsg : 'network' }
}

async function disableWechatNotify (db, settings, now) {
  const subscription = settings.subscription != null ? settings.subscription : {}
  subscription.accepted = false
  await db.collection(config.COLLECTIONS.settings).doc(settings._id).update({
    notifyWechat: false,
    subscription: subscription,
    updatedAt: now
  })
}

exports.main = async function (event, context) {
  if (!config.APP_SECRET || !config.SUBSCRIBE_TEMPLATE_ID) {
    return {
      ok: false,
      reason: 'CONFIG_MISSING',
      hint: '请在 uniCloud-alipay/cloudfunctions/mint-notify/config.js 填写 APP_SECRET 与 SUBSCRIBE_TEMPLATE_ID 后重新上传'
    }
  }

  const db = uniCloud.database()
  const dbCmd = db.command
  const now = Date.now()
  const range = monthRange(now)

  const tokenResult = await fetchAccessToken()
  if (!tokenResult.ok) {
    return { ok: false, reason: 'ACCESS_TOKEN_FAILED', detail: tokenResult.detail }
  }
  const accessToken = tokenResult.token

  const settingsRes = await db.collection(config.COLLECTIONS.settings)
    .where({ notifyWechat: true })
    .limit(config.MAX_USERS_PER_RUN)
    .get()
  const users = settingsRes.data != null ? settingsRes.data : []

  let sent = 0
  let skipped = 0
  let failed = 0
  const failures = []

  for (let i = 0; i < users.length; i++) {
    const settings = users[i]
    const openid = settings.openid
    if (typeof openid !== 'string' || openid.length === 0) continue
    if (settings.subscription == null || settings.subscription.accepted !== true) {
      skipped++
      continue
    }

    try {
      const budgetsRes = await db.collection(config.COLLECTIONS.budgets).where({ openid: openid }).get()
      const budgets = budgetsRes.data != null ? budgetsRes.data : []
      if (budgets.length === 0) {
        skipped++
        continue
      }

      const txsRes = await db.collection(config.COLLECTIONS.transactions)
        .where({
          openid: openid,
          type: 'expense',
          date: dbCmd.gte(range.start).and(dbCmd.lt(range.end))
        })
        .limit(1000)
        .get()
      const txs = txsRes.data != null ? txsRes.data : []
      const rates = rateMap(settings)
      const locale = settings.locale === 'en' ? 'en' : 'zh'

      for (let b = 0; b < budgets.length; b++) {
        const budget = budgets[b]
        const limit = Number(budget.amount)
        if (!isFinite(limit) || limit <= 0) continue

        const spent = spentFor(budget, txs, rates)
        const percent = spent / limit * 100
        const threshold = Number(budget.alertAt) > 0 ? Number(budget.alertAt) : 80
        if (percent < threshold) continue

        // 去重：同一用户、同一月份、同一预算只发一条。
        const dedupeRes = await db.collection(config.COLLECTIONS.alertLog)
          .where({ openid: openid, monthKey: range.monthKey, budgetId: budget._id })
          .limit(1)
          .get()
        if (dedupeRes.data != null && dedupeRes.data.length > 0) {
          skipped++
          continue
        }

        const sendResult = await sendSubscribeMessage(accessToken, settings, budget, spent)
        if (sendResult.ok) {
          sent++
          try {
            await db.collection(config.COLLECTIONS.alertLog).add({
              openid: openid,
              monthKey: range.monthKey,
              budgetId: budget._id,
              categoryId: budget.categoryId,
              amount: Math.round(spent * 100) / 100,
              limit: limit,
              channel: 'wechat',
              sentAt: Date.now()
            })
          } catch (e) {
            // 唯一索引冲突说明并发下已写入，忽略。
          }
          if (config.ONE_OFF_TEMPLATE) {
            // 一次性订阅模板额度已被消耗，关闭提醒等待用户再次授权。
            await disableWechatNotify(db, settings, Date.now())
          }
        } else {
          failed++
          failures.push({ openid: openid, budgetId: budget._id, errcode: sendResult.errcode, errmsg: sendResult.errmsg })
          if (sendResult.errcode === 43101 && config.ONE_OFF_TEMPLATE) {
            // 用户未授权或额度已用完，关闭提醒。
            await disableWechatNotify(db, settings, Date.now())
          }
        }
      }
    } catch (e) {
      failed++
      failures.push({ openid: openid, error: String(e && e.message ? e.message : e) })
    }
  }

  return {
    ok: true,
    monthKey: range.monthKey,
    users: users.length,
    sent: sent,
    skipped: skipped,
    failed: failed,
    failures: failures.slice(0, 10)
  }
}