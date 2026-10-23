'use strict'

/**
 * mint-notify 配置模板：复制为 config.js 后再填写。
 *
 * 与 mint-core 一样：
 * 1. APP_SECRET 只允许保存在云端，绝不能进入小程序客户端。
 * 2. SUBSCRIBE_TEMPLATE_ID 需要与 constants/config.uts、mint-core/config.js 保持一致。
 * 3. SUBSCRIBE_DATA_KEYS 按你在微信公众平台申请的模板字段修改：
 *    字段名形如 thing1 / thing2 / amount3，类型与顺序以模板详情页为准。
 */
module.exports = {
  APP_ID: 'wx070e2726c50a9368',
  APP_SECRET: '',
  SUBSCRIBE_TEMPLATE_ID: '',

  /** 订阅消息点击后跳转的小程序页面。 */
  SUBSCRIBE_PAGE: 'pages/shell/shell?tab=budgets',

  /**
   * 订阅消息 data 字段键（按模板修改）。
   * title:    提醒标题
   * category: 预算对象（分类名或「本月总预算」）
   * spent:    本月已用金额
   * limit:    预算上限
   */
  SUBSCRIBE_DATA_KEYS: {
    title: 'thing1',
    category: 'thing2',
    spent: 'amount3',
    limit: 'amount4'
  },

  /**
   * 一次性订阅模板：发送成功后微信额度即被消耗，
   * 本函数会自动关闭该用户的微信提醒，等待其在小程序内再次授权。
   * 若你申请的是长期订阅模板，把这里改为 false。
   */
  ONE_OFF_TEMPLATE: true,

  ALERT_TITLE: '预算提醒',
  TOTAL_LABEL: '本月总预算',

  /** 单次运行最多处理的用户数。 */
  MAX_USERS_PER_RUN: 200,

  COLLECTIONS: {
    users: 'mint-users',
    transactions: 'mint-transactions',
    debts: 'mint-debts',
    budgets: 'mint-budgets',
    settings: 'mint-settings',
    alertLog: 'mint-alert-log'
  },

  /** 与 mint-core 默认汇率保持一致；用户自定义汇率以 mint-settings 为准。 */
  DEFAULT_RATES: [
    { currency: 'CNY', rateCny: 1 },
    { currency: 'USD', rateCny: 7.18 },
    { currency: 'EUR', rateCny: 7.82 },
    { currency: 'JPY', rateCny: 0.0478 },
    { currency: 'HKD', rateCny: 0.92 },
    { currency: 'GBP', rateCny: 9.21 },
    { currency: 'SGD', rateCny: 5.34 }
  ]
}