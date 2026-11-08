/**
 * 核销订单：惰性过期与并发安全的应付金额分配。
 *
 * 应付金额 = 标价 + 尾数，尾数取 1–99 分。同一收款账户下，活跃订单的应付金额
 * 必须全局唯一 —— 人工对着账单要能一眼分清哪笔钱对应哪张订单。
 *
 * 唯一性由数据库的 partial unique index 兜底，**不采用「先查空位再插入」**：
 * 那样并发请求会同时选中同一个尾数。这里只做随机起点 + 环形扫描，每次都真的
 * INSERT，让唯一索引来判定谁赢了。
 */

import { and, eq, lte } from 'drizzle-orm'
import { resolveCollectionAccount } from '@/collection/accounts'
import { resolveCollectionPrice } from '@/collection/pricing'
import {
  CollectionError,
  type CollectionOrder,
  type CollectionOrderStatus,
  type CollectionPrice,
  type ResolvedCollectionAccount,
} from '@/collection/types'
import { websiteConfig } from '@/config/website'
import { type DB, schema } from '@/db'

/** 订单有效期：精确 15 分钟。 */
export const COLLECTION_ORDER_TTL_SECONDS = 15 * 60
/** 尾数下界。 */
export const FINGERPRINT_MIN = 1
/** 尾数上界。 */
export const FINGERPRINT_MAX = 99

const FINGERPRINT_SPAN = FINGERPRINT_MAX - FINGERPRINT_MIN + 1

type CollectionOrderRow = typeof schema.collectionOrders.$inferSelect

/** 创建订单的输入。 */
export interface CreateOrderInput {
  userId: string
  productId: string
  offerId: string
}

/**
 * 把该账户已到期的待支付订单标记为已过期，释放它们占用的尾数。
 *
 * 只动 `pending_payment`：已申报待核验的订单要一直占着尾数，直到管理员处理，
 * 否则用户申报后金额可能被重新分配出去，人工核验就无从对账。
 *
 * @returns 被标记为已过期的订单数
 */
export async function expirePendingOrders(db: DB, accountId: string, now: Date): Promise<number> {
  const expired = await db
    .update(schema.collectionOrders)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(schema.collectionOrders.accountId, accountId),
        eq(schema.collectionOrders.status, 'pending_payment'),
        lte(schema.collectionOrders.expiresAt, now),
      ),
    )
    .returning({ id: schema.collectionOrders.id })
  return expired.length
}

/**
 * 创建一笔待支付的核销订单。
 *
 * 步骤：解析本地价格 → 解析收款账户 → 惰性过期该账户的待支付订单 →
 * 随机起点 + 环形扫描 99 个尾数，直接 INSERT 由唯一索引判定冲突。
 */
export async function createOrder(
  db: DB,
  input: CreateOrderInput,
  now: Date = new Date(),
): Promise<CollectionOrder> {
  const price = resolveCollectionPrice(input.productId, input.offerId)
  if (!price) {
    throw new CollectionError(
      'INVALID_OFFER',
      `商品 ${input.productId} 的付费方式 ${input.offerId} 没有可用的核销价格`,
    )
  }

  const account = await resolveCollectionAccount(db, websiteConfig.collection)
  if (!account) {
    throw new CollectionError('NO_COLLECTION_ACCOUNT', '没有可用的收款账户')
  }

  await expirePendingOrders(db, account.id, now)

  const expiresAt = new Date(now.getTime() + COLLECTION_ORDER_TTL_SECONDS * 1000)
  const start = randomFingerprintStart()

  for (let offset = 0; offset < FINGERPRINT_SPAN; offset++) {
    const fingerprint = ((start - FINGERPRINT_MIN + offset) % FINGERPRINT_SPAN) + FINGERPRINT_MIN
    const row = buildOrder({ input, price, account, fingerprint, now, expiresAt })
    try {
      await db.insert(schema.collectionOrders).values(row)
      return toCollectionOrder(row)
    } catch (error) {
      // 唯一索引说这个尾数被占了：换下一个候选。
      if (!isUniqueConstraintError(error)) throw error
    }
  }

  throw new CollectionError('AMOUNT_POOL_EXHAUSTED', '该收款账户的应付金额池已被活跃订单占满')
}

function buildOrder(params: {
  input: CreateOrderInput
  price: CollectionPrice
  account: ResolvedCollectionAccount
  fingerprint: number
  now: Date
  expiresAt: Date
}): CollectionOrderRow {
  const { input, price, account, fingerprint, now, expiresAt } = params
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    accountId: account.id,
    channel: account.channel,
    qrImageUrl: account.qrImageUrl,
    qrImageKey: account.qrImageKey,
    productId: input.productId,
    offerId: input.offerId,
    kind: price.kind,
    interval: price.interval ?? null,
    intervalCount: price.intervalCount ?? null,
    baseAmount: price.amount,
    fingerprint,
    payableAmount: price.amount + fingerprint,
    currency: price.currency,
    status: 'pending_payment',
    payerNote: null,
    receiptKey: null,
    submittedAt: null,
    observedAmount: null,
    externalReference: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    expiresAt,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

function toCollectionOrder(row: CollectionOrderRow): CollectionOrder {
  return {
    ...row,
    channel: row.channel as CollectionOrder['channel'],
    kind: row.kind as CollectionOrder['kind'],
    interval: row.interval as CollectionOrder['interval'],
    currency: row.currency as CollectionOrder['currency'],
    status: row.status as CollectionOrderStatus,
  }
}

/** 随机起点：1–99。随机只负责分散热点，正确性由唯一索引保证。 */
function randomFingerprintStart(): number {
  const buffer = new Uint8Array(1)
  crypto.getRandomValues(buffer)
  return ((buffer[0] ?? 0) % FINGERPRINT_SPAN) + FINGERPRINT_MIN
}

/**
 * 判断异常是不是唯一约束冲突。
 *
 * SQLite（本地与 D1 都一样）报 `UNIQUE constraint failed`；不同运行时的错误
 * 包装方式不同，所以既看消息也看错误码，还看一层 `cause`。
 */
function isUniqueConstraintError(error: unknown, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) return false
  const candidate = error as {
    message?: unknown
    code?: unknown
    errcode?: unknown
    errstr?: unknown
    cause?: unknown
  }
  const text = [candidate.message, candidate.errstr]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  if (/UNIQUE constraint failed/i.test(text)) return true
  if (candidate.code === 'SQLITE_CONSTRAINT_UNIQUE' || candidate.code === 23505) return true
  // SQLite 的扩展错误码：2067 = SQLITE_CONSTRAINT_UNIQUE。
  if (candidate.errcode === 2067) return true
  if (candidate.cause && candidate.cause !== error) {
    return isUniqueConstraintError(candidate.cause, depth + 1)
  }
  return false
}
