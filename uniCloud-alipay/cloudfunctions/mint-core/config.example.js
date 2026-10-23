'use strict'

/**
 * 配置模板：复制为 config.js 后再填写。
 * APP_SECRET 只能保存在云端，绝不能进入小程序客户端。
 */
module.exports = {
  APP_ID: 'wx070e2726c50a9368',
  APP_SECRET: '',
  TOKEN_SECRET: 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',
  TOKEN_TTL_SECONDS: 60 * 60 * 24 * 30,
  SUBSCRIBE_TEMPLATE_ID: '',
  SUBSCRIBE_PAGE: 'pages/shell/shell?tab=budgets',
  DEFAULT_LOCALE: 'zh',
  DEFAULT_BASE_CURRENCY: 'CNY',
  DEFAULT_RATES: [
    { currency: 'CNY', rateCny: 1 },
    { currency: 'USD', rateCny: 7.18 },
    { currency: 'EUR', rateCny: 7.82 },
    { currency: 'JPY', rateCny: 0.0478 },
    { currency: 'HKD', rateCny: 0.92 },
    { currency: 'GBP', rateCny: 9.21 },
    { currency: 'SGD', rateCny: 5.34 }
  ],
  COLLECTIONS: {
    users: 'mint-users',
    transactions: 'mint-transactions',
    debts: 'mint-debts',
    budgets: 'mint-budgets',
    settings: 'mint-settings',
    alertLog: 'mint-alert-log'
  }
}
