import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 价格解析打桩：核销链路的金额事实源在商品配置里，测试要断言的是
 * 「标价 + 尾数」这条规则，不该被出厂配置的具体金额牵着走。
 */
const productMocks = vi.hoisted(() => ({
  resolveCollectionPrice: vi.fn(),
}))

vi.mock('@/config/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/products')>()
  return { ...actual, resolveCollectionPrice: productMocks.resolveCollectionPrice }
})

import { resolveCollectionAccount } from '@/collection/accounts'
import { COLLECTION_ORDER_TTL_SECONDS, createOrder, expirePendingOrders } from '@/collection/orders'
import type { CollectionAccountConfig } from '@/collection/types'
import { websiteConfig } from '@/config/website'
import { type DB, schema } from '@/db'

/** 回放全部迁移，得到与生产同构的内存 SQLite。 */
function database(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/db/migrations')
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`src/db/migrations/${name}`, 'utf8'))
  }
  return sqlite
}

function tableNames(sqlite: DatabaseSync): string[] {
  return sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => (row as { name: string }).name)
}

function indexSql(sqlite: DatabaseSync, name: string): string {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(name)
  return (row as { sql: string } | undefined)?.sql ?? ''
}

function columns(sqlite: DatabaseSync, table: string): { name: string; notnull: number }[] {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => {
      const { name, notnull } = row as { name: string; notnull: number }
      return { name, notnull }
    })
}

describe('collection 数据表迁移', () => {
  it('迁移创建 collection 表', () => {
    const sqlite = database()
    expect(tableNames(sqlite)).toContain('collection_orders')
    expect(tableNames(sqlite)).toContain('collection_accounts')
    sqlite.close()
  })

  it('collection_accounts 列与规格一致', () => {
    const sqlite = database()
    expect(columns(sqlite, 'collection_accounts')).toEqual([
      { name: 'id', notnull: 1 },
      { name: 'channel', notnull: 1 },
      { name: 'display_name', notnull: 1 },
      { name: 'currency', notnull: 1 },
      { name: 'qr_image_key', notnull: 0 },
      { name: 'enabled', notnull: 1 },
      { name: 'updated_by', notnull: 0 },
      { name: 'created_at', notnull: 1 },
      { name: 'updated_at', notnull: 1 },
    ])
    sqlite.close()
  })

  it('collection_orders 列与规格一致', () => {
    const sqlite = database()
    expect(columns(sqlite, 'collection_orders')).toEqual([
      { name: 'id', notnull: 1 },
      { name: 'user_id', notnull: 1 },
      { name: 'account_id', notnull: 1 },
      { name: 'channel', notnull: 1 },
      { name: 'qr_image_url', notnull: 0 },
      { name: 'qr_image_key', notnull: 0 },
      { name: 'product_id', notnull: 1 },
      { name: 'offer_id', notnull: 1 },
      { name: 'kind', notnull: 1 },
      { name: 'interval', notnull: 0 },
      { name: 'interval_count', notnull: 0 },
      { name: 'base_amount', notnull: 1 },
      { name: 'fingerprint', notnull: 1 },
      { name: 'payable_amount', notnull: 1 },
      { name: 'currency', notnull: 1 },
      { name: 'status', notnull: 1 },
      { name: 'payer_note', notnull: 0 },
      { name: 'receipt_key', notnull: 0 },
      { name: 'submitted_at', notnull: 0 },
      { name: 'observed_amount', notnull: 0 },
      { name: 'external_reference', notnull: 0 },
      { name: 'review_note', notnull: 0 },
      { name: 'reviewed_by', notnull: 0 },
      { name: 'reviewed_at', notnull: 0 },
      { name: 'expires_at', notnull: 1 },
      { name: 'settled_at', notnull: 0 },
      { name: 'created_at', notnull: 1 },
      { name: 'updated_at', notnull: 1 },
    ])
    sqlite.close()
  })

  it('迁移创建 collection 表与两个 partial unique index', () => {
    const sqlite = database()
    expect(tableNames(sqlite)).toContain('collection_orders')
    expect(tableNames(sqlite)).toContain('collection_accounts')
    expect(indexSql(sqlite, 'collection_orders_active_amount_unique')).toContain(
      "status IN ('pending_payment','pending_verification','settling')",
    )
    expect(indexSql(sqlite, 'collection_orders_settling_user_unique')).toContain(
      "status = 'settling'",
    )
    sqlite.close()
  })

  it('活跃金额唯一索引覆盖收款账户与应付金额两列', () => {
    const sqlite = database()
    expect(
      sqlite
        .prepare('PRAGMA index_info(collection_orders_active_amount_unique)')
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual(['account_id', 'payable_amount'])
    expect(
      sqlite
        .prepare('PRAGMA index_info(collection_orders_settling_user_unique)')
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual(['user_id'])
    sqlite.close()
  })

  it('订单列表与惰性过期索引存在', () => {
    const sqlite = database()
    expect(
      sqlite
        .prepare('PRAGMA index_info(collection_orders_user_status_idx)')
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual(['user_id', 'status'])
    expect(
      sqlite
        .prepare('PRAGMA index_info(collection_orders_status_expires_idx)')
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual(['status', 'expires_at'])
    sqlite.close()
  })

  it('迁移不改动既有支付表结构', () => {
    const sqlite = database()
    expect(columns(sqlite, 'payments').map((column) => column.name)).toEqual([
      'id',
      'user_id',
      'provider',
      'external_id',
      'type',
      'invoice_id',
      'charge_id',
      'subscription_id',
      'status',
      'amount',
      'refunded_amount',
      'currency',
      'description',
      'product_id',
      'offer_id',
      'customer_id',
      'event_created',
      'paid_at',
      'refunded_at',
      'created_at',
    ])
    expect(columns(sqlite, 'subscriptions').map((column) => column.name)).toContain('offer_id')
    sqlite.close()
  })

  it('活跃金额唯一索引只约束三种活跃状态', () => {
    const sqlite = database()
    sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1)",
    )
    const insert = (id: string, status: string, amount: number) =>
      sqlite
        .prepare(
          `INSERT INTO collection_orders(id,user_id,account_id,channel,product_id,offer_id,kind,base_amount,fingerprint,payable_amount,currency,status,expires_at)
           VALUES (?, 'u1', 'acct', 'alipay', 'pro', 'monthly', 'subscription', ?, 1, ?, 'cny', ?, 1)`,
        )
        .run(id, amount - 1, amount, status)

    insert('a', 'pending_payment', 1000)
    expect(() => insert('b', 'pending_verification', 1000)).toThrow(/UNIQUE/)
    expect(() => insert('c', 'settling', 1000)).toThrow(/UNIQUE/)
    // 非活跃状态不占坑，同一金额可再次使用。
    expect(() => insert('d', 'expired', 1000)).not.toThrow()
    expect(() => insert('e', 'settled', 1000)).not.toThrow()
    sqlite.close()
  })

  it('结算临界区唯一索引限制同一用户只能有一个 settling 订单', () => {
    const sqlite = database()
    sqlite.exec(
      "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1)",
    )
    const insert = (id: string, userId: string, amount: number) =>
      sqlite
        .prepare(
          `INSERT INTO collection_orders(id,user_id,account_id,channel,product_id,offer_id,kind,base_amount,fingerprint,payable_amount,currency,status,expires_at)
           VALUES (?, ?, 'acct', 'alipay', 'pro', 'monthly', 'subscription', ?, 1, ?, 'cny', 'settling', 1)`,
        )
        .run(id, userId, amount - 1, amount)

    insert('a', 'u1', 1000)
    expect(() => insert('b', 'u1', 1001)).toThrow(/UNIQUE/)
    expect(() => insert('c', 'u2', 1002)).not.toThrow()
    sqlite.close()
  })
})

// --- 收款账户解析与金额分配 ---------------------------------------------------

/** 夹具里的标价（分）与商品 / 付费方式标识。 */
const BASE_AMOUNT = 18_000
const PRODUCT_ID = 'pro'
const OFFER_ID = 'monthly'

const ACCOUNT_CONFIG: CollectionAccountConfig = {
  id: 'acct-main',
  channel: 'alipay',
  displayName: '配置账户',
  currency: 'cny',
  qrImageUrl: '/collection/main.png',
}

const OTHER_ACCOUNT_CONFIG: CollectionAccountConfig = {
  id: 'acct-other',
  channel: 'alipay',
  displayName: '备用账户',
  currency: 'cny',
  qrImageUrl: '/collection/other.png',
}

/** 内存 SQLite + 全迁移回放 + 可用的 Drizzle db。 */
function collectionDatabase() {
  const sqlite = database()
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1)",
  )
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) }
  })
  return { sqlite, db: db as unknown as DB }
}

/** 直接写一行订单：用来占住尾数，模拟「别的请求已经占了这个金额」。 */
function occupy(
  sqlite: DatabaseSync,
  options: {
    id: string
    fingerprint: number
    status?: string
    accountId?: string
    userId?: string
    /** 到期时间；默认一年后。 */
    expiresAt?: number
  },
): void {
  const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  sqlite
    .prepare(
      `INSERT INTO collection_orders(id,user_id,account_id,channel,product_id,offer_id,kind,base_amount,fingerprint,payable_amount,currency,status,expires_at,created_at,updated_at)
       VALUES (?, ?, ?, 'alipay', ?, ?, 'one_time', ?, ?, ?, 'cny', ?, ?, ?, ?)`,
    )
    .run(
      options.id,
      options.userId ?? 'u1',
      options.accountId ?? 'acct-main',
      PRODUCT_ID,
      OFFER_ID,
      BASE_AMOUNT,
      options.fingerprint,
      BASE_AMOUNT + options.fingerprint,
      options.status ?? 'pending_payment',
      expiresAt,
      expiresAt,
      expiresAt,
    )
}

function orderStatus(sqlite: DatabaseSync, id: string): string {
  const row = sqlite.prepare('SELECT status FROM collection_orders WHERE id = ?').get(id) as
    | { status: string }
    | undefined
  return row?.status ?? ''
}

/** 把随机起点固定下来，让环形扫描的顺序可断言。 */
function forceFingerprintStart(value: number): void {
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    ;(array as Uint8Array)[0] = value
    return array
  })
}

const originalAccounts = websiteConfig.collection.accounts

beforeEach(() => {
  productMocks.resolveCollectionPrice.mockReturnValue({
    amount: BASE_AMOUNT,
    currency: 'cny',
    kind: 'one_time',
  })
  websiteConfig.collection.accounts = [ACCOUNT_CONFIG]
})

afterEach(() => {
  websiteConfig.collection.accounts = originalAccounts
  vi.restoreAllMocks()
})

describe('收款账户解析', () => {
  it('没有数据库记录时用源码配置兜底', async () => {
    const { db, sqlite } = collectionDatabase()
    const account = await resolveCollectionAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account).toEqual({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '配置账户',
      currency: 'cny',
      qrImageUrl: '/collection/main.png',
      qrImageKey: null,
    })
    sqlite.close()
  })

  it('数据库里的运营记录按 ID 覆盖配置', async () => {
    const { db, sqlite } = collectionDatabase()
    await db.insert(schema.collectionAccounts).values({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '运营改过的名字',
      currency: 'cny',
      qrImageKey: 'collection-qrcodes/main.png',
      enabled: true,
    })
    const account = await resolveCollectionAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account).toMatchObject({
      id: 'acct-main',
      displayName: '运营改过的名字',
      qrImageKey: 'collection-qrcodes/main.png',
    })
    sqlite.close()
  })

  it('数据库里没有对应配置的账户 ID 不参与解析', async () => {
    const { db, sqlite } = collectionDatabase()
    await db.insert(schema.collectionAccounts).values({
      id: 'acct-stranger',
      channel: 'alipay',
      displayName: '陌生账户',
      currency: 'cny',
      enabled: true,
    })
    const account = await resolveCollectionAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account?.id).toBe('acct-main')
    sqlite.close()
  })

  it('被禁用的账户被跳过并继续找下一个', async () => {
    const { db, sqlite } = collectionDatabase()
    await db.insert(schema.collectionAccounts).values({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '主账户',
      currency: 'cny',
      enabled: false,
    })
    const account = await resolveCollectionAccount(db, {
      accounts: [ACCOUNT_CONFIG, OTHER_ACCOUNT_CONFIG],
    })
    expect(account?.id).toBe('acct-other')
    sqlite.close()
  })

  it('全部账户被禁用时没有可用账户', async () => {
    const { db, sqlite } = collectionDatabase()
    await db.insert(schema.collectionAccounts).values({
      id: 'acct-main',
      channel: 'alipay',
      displayName: '主账户',
      currency: 'cny',
      enabled: false,
    })
    const account = await resolveCollectionAccount(db, { accounts: [ACCOUNT_CONFIG] })
    expect(account).toBeNull()
    sqlite.close()
  })
})

describe('核销订单金额分配', () => {
  it('没有可用账户时抛 NO_COLLECTION_ACCOUNT', async () => {
    const { db, sqlite } = collectionDatabase()
    websiteConfig.collection.accounts = []
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ).rejects.toMatchObject({ code: 'NO_COLLECTION_ACCOUNT' })
    sqlite.close()
  })

  it('商品没有核销价格时抛 INVALID_OFFER', async () => {
    const { db, sqlite } = collectionDatabase()
    productMocks.resolveCollectionPrice.mockReturnValue(undefined)
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ).rejects.toMatchObject({ code: 'INVALID_OFFER' })
    sqlite.close()
  })

  it('应付金额等于标价加尾数且尾数落在 1 到 99', async () => {
    const { db, sqlite } = collectionDatabase()
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).toBeGreaterThanOrEqual(1)
    expect(order.fingerprint).toBeLessThanOrEqual(99)
    expect(order.payableAmount).toBe(BASE_AMOUNT + order.fingerprint)
    expect(order.baseAmount).toBe(BASE_AMOUNT)
    sqlite.close()
  })

  it('订单快照收款账户与价格字段，有效期是创建时间加 15 分钟', async () => {
    const { db, sqlite } = collectionDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const order = await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      now,
    )
    expect(order).toMatchObject({
      userId: 'u1',
      accountId: 'acct-main',
      channel: 'alipay',
      qrImageUrl: '/collection/main.png',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
      kind: 'one_time',
      currency: 'cny',
      status: 'pending_payment',
    })
    expect(order.expiresAt.getTime()).toBe(now.getTime() + COLLECTION_ORDER_TTL_SECONDS * 1000)
    expect(COLLECTION_ORDER_TTL_SECONDS).toBe(15 * 60)
    // D1 的 timestamp 列是整数秒：存的是裸秒整数，不是毫秒。
    const stored = sqlite
      .prepare('SELECT created_at, expires_at FROM collection_orders WHERE id = ?')
      .get(order.id) as { created_at: number; expires_at: number }
    expect(stored.created_at).toBe(Math.floor(now.getTime() / 1000))
    expect(stored.expires_at).toBe(Math.floor(now.getTime() / 1000) + 15 * 60)
    sqlite.close()
  })

  it('同一账户已占用的尾数不会被再次分配', async () => {
    const { db, sqlite } = collectionDatabase()
    occupy(sqlite, { id: 'taken', fingerprint: 5 })
    forceFingerprintStart(4)
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).not.toBe(5)
    expect(order.payableAmount).toBe(BASE_AMOUNT + order.fingerprint)
    sqlite.close()
  })

  it('金额唯一性按收款账户约束：别的账户占用同额不阻塞', async () => {
    const { db, sqlite } = collectionDatabase()
    // 另一个收款账户已经用了同一个应付金额。
    occupy(sqlite, { id: 'other-account-order', fingerprint: 7, accountId: 'acct-other' })
    // 主账户只剩尾数 7 空着。
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      if (fingerprint === 7) continue
      occupy(sqlite, { id: `busy-${fingerprint}`, fingerprint })
    }
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).toBe(7)
    sqlite.close()
  })

  it('同一账户并发创建不会拿到相同应付金额', async () => {
    const { db, sqlite } = collectionDatabase()
    forceFingerprintStart(0)
    const [first, second] = await Promise.all([
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
      createOrder(db, { userId: 'u2', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ])
    expect(first.payableAmount).not.toBe(second.payableAmount)
    sqlite.close()
  })

  it('99 个活跃金额占满后抛 AMOUNT_POOL_EXHAUSTED', async () => {
    const { db, sqlite } = collectionDatabase()
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      occupy(sqlite, { id: `full-${fingerprint}`, fingerprint })
    }
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }),
    ).rejects.toMatchObject({ code: 'AMOUNT_POOL_EXHAUSTED' })
    sqlite.close()
  })

  it('随机起点之后按环形顺序扫描下一个空尾数', async () => {
    const { db, sqlite } = collectionDatabase()
    occupy(sqlite, { id: 'busy-1', fingerprint: 1 })
    occupy(sqlite, { id: 'busy-2', fingerprint: 2 })
    forceFingerprintStart(0)
    const order = await createOrder(db, {
      userId: 'u1',
      productId: PRODUCT_ID,
      offerId: OFFER_ID,
    })
    expect(order.fingerprint).toBe(3)
    sqlite.close()
  })
})

describe('核销订单惰性过期', () => {
  it('创建订单前把已到期的待支付订单标记为过期并释放金额', async () => {
    const { db, sqlite } = collectionDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const past = Math.floor(now.getTime() / 1000) - 60
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      if (fingerprint === 5) continue
      occupy(sqlite, { id: `busy-${fingerprint}`, fingerprint })
    }
    occupy(sqlite, { id: 'stale', fingerprint: 5, expiresAt: past })
    const order = await createOrder(
      db,
      { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID },
      now,
    )
    expect(orderStatus(sqlite, 'stale')).toBe('expired')
    expect(order.fingerprint).toBe(5)
    sqlite.close()
  })

  it('已申报待核验的订单不会被惰性过期', async () => {
    const { db, sqlite } = collectionDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const past = Math.floor(now.getTime() / 1000) - 60
    for (let fingerprint = 1; fingerprint <= 99; fingerprint++) {
      if (fingerprint === 3) continue
      occupy(sqlite, { id: `busy-${fingerprint}`, fingerprint })
    }
    occupy(sqlite, {
      id: 'submitted',
      fingerprint: 3,
      status: 'pending_verification',
      expiresAt: past,
    })
    await expect(
      createOrder(db, { userId: 'u1', productId: PRODUCT_ID, offerId: OFFER_ID }, now),
    ).rejects.toMatchObject({ code: 'AMOUNT_POOL_EXHAUSTED' })
    expect(orderStatus(sqlite, 'submitted')).toBe('pending_verification')
    sqlite.close()
  })

  it('expirePendingOrders 返回被标记为过期的订单数', async () => {
    const { db, sqlite } = collectionDatabase()
    const now = new Date('2026-01-01T00:00:00.000Z')
    const past = Math.floor(now.getTime() / 1000) - 60
    occupy(sqlite, { id: 'stale-1', fingerprint: 1, expiresAt: past })
    occupy(sqlite, { id: 'stale-2', fingerprint: 2, expiresAt: past })
    occupy(sqlite, { id: 'alive', fingerprint: 3 })
    const expired = await expirePendingOrders(db, 'acct-main', now)
    expect(expired).toBe(2)
    expect(orderStatus(sqlite, 'stale-1')).toBe('expired')
    expect(orderStatus(sqlite, 'alive')).toBe('pending_payment')
    sqlite.close()
  })
})
