import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

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
