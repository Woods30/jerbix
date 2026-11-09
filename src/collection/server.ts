import { createServerFn } from '@tanstack/react-start'
import type { AdminOrderPage } from '@/collection/orders'
import {
  adminOrderListSchema,
  type CollectionGuardDeps,
  cancelOrderSchema,
  collectionAccountSchema,
  createOrderSchema,
  errorResponse,
  failureResponse,
  guardCollectionRequest,
  orderIdSchema,
  resolveAdminOrderQuery,
  reviewOrderSchema,
  submitOrderSchema,
} from '@/collection/server-logic'
import type { CollectionOrder, UserOrderPage } from '@/collection/types'
import type { schema } from '@/db'

/** 收款账户的数据库行。 */
type CollectionAccountRow = (typeof schema.collectionAccounts)['$inferSelect']

/**
 * 核销型支付的 server functions。
 *
 * 这里是**薄边界**：取依赖、跑门禁、把领域错误翻译成响应。可测的判断都在
 * `server-logic.ts` 与领域层，server function 自己不做业务判断。
 *
 * 三条硬规则贯穿本文件：
 *
 * - **返回错误而不是抛出错误**：框架把 handler 返回的 `Response` 原样发给客户端
 *   （状态码与响应体都保留），而抛出的 `Response` 在服务端渲染与浏览器里表现
 *   不一致（前者抛出、后者 resolve）。统一「返回」，客户端只需要认一种形态。
 * - **用户身份只来自服务端会话**：客户端传的 userId / role 一律不读。
 * - **顺序固定**：模块门禁 → 服务端会话 → 角色 → 限流 → 参数校验 → 领域函数。
 *   参数校验刻意放在 handler 内而不是 `.validator()` 里 —— `.validator()` 在
 *   门禁之前就跑，会让「模块关闭时还要不要解析入参」这件事失去意义。
 */

/** 取门禁所需的依赖。 */
async function guardDeps(): Promise<CollectionGuardDeps> {
  const [
    { getModuleUnavailableResponse },
    { getServerContext },
    { getAuth },
    { getRequestHeaders },
    { checkRateLimit },
  ] = await Promise.all([
    import('@/lib/module-access.server'),
    import('@/lib/server-context'),
    import('@/auth/auth'),
    import('@tanstack/react-start/server'),
    import('@/lib/rate-limit'),
  ])

  const headers = await getRequestHeaders()
  return {
    module: () => getModuleUnavailableResponse('collection'),
    session: async () => {
      const env = getServerContext().env
      const session = await getAuth(env).api.getSession({ headers })
      if (!session) return null
      return { userId: session.user.id, role: session.user.role ?? 'user' }
    },
    rateLimit: checkRateLimit,
    // `cf-connecting-ip` 可信；`x-forwarded-for` 可伪造，不用。
    ip: headers.get('cf-connecting-ip') ?? 'unknown',
  }
}

/** 取数据库连接。 */
async function collectionDb() {
  const [{ createDb }, { getServerContext }] = await Promise.all([
    import('@/db'),
    import('@/lib/server-context'),
  ])
  return createDb(getServerContext().env.DB)
}

/** 用户创建订单：分配一个唯一的应付金额。 */
export const createCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ id: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { limit: 'create-order' })
    if (!guard.ok) return guard.response

    const parsed = createOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { createOrder } = await import('@/collection/orders')
      const order = await createOrder(await collectionDb(), {
        userId: guard.session.userId,
        ...parsed.data,
      })
      return { id: order.id }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 用户申报「我已支付」。 */
export const submitCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ status: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { limit: 'submit-order' })
    if (!guard.ok) return guard.response

    const parsed = submitOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { submitOrder } = await import('@/collection/orders')
      const order = await submitOrder(await collectionDb(), {
        userId: guard.session.userId,
        ...parsed.data,
      })
      return { status: order.status }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 用户取消未支付的订单。 */
export const cancelCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ status: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps())
    if (!guard.ok) return guard.response

    const parsed = cancelOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { cancelOrder } = await import('@/collection/orders')
      const order = await cancelOrder(await collectionDb(), {
        userId: guard.session.userId,
        ...parsed.data,
      })
      return { status: order.status }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 读取自己的订单详情。 */
export const fetchCollectionOrderFn = createServerFn({ method: 'GET' }).handler(
  async ({ data }): Promise<CollectionOrder | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { limit: 'poll-order' })
    if (!guard.ok) return guard.response

    const parsed = orderIdSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { getUserOrder } = await import('@/collection/orders')
      const order = await getUserOrder(
        await collectionDb(),
        guard.session.userId,
        parsed.data.orderId,
      )
      // 他人的订单与不存在的订单不可区分。
      if (!order) return errorResponse('ORDER_NOT_FOUND')
      return order
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 用户自己的订单列表。 */
export const fetchMyCollectionOrdersFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<UserOrderPage | Response> => {
    const guard = await guardCollectionRequest(await guardDeps())
    if (!guard.ok) return guard.response

    try {
      const { listUserOrders } = await import('@/collection/orders')
      return await listUserOrders(await collectionDb(), { userId: guard.session.userId })
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 管理员读取订单队列，默认只看待核验。 */
export const fetchAdminCollectionOrdersFn = createServerFn({ method: 'GET' }).handler(
  async ({ data }): Promise<AdminOrderPage | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { requireAdmin: true })
    if (!guard.ok) return guard.response

    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const parsed = adminOrderListSchema.safeParse({
      status: raw.status,
      limit: raw.limit,
      offset: raw.offset,
    })
    if (!parsed.success) return errorResponse('INVALID_INPUT')
    const query = resolveAdminOrderQuery(parsed.data)

    try {
      const { listAllOrders } = await import('@/collection/orders')
      return await listAllOrders(await collectionDb(), {
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      })
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 管理员核验订单。 */
export const reviewCollectionOrderFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ status: string } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), {
      requireAdmin: true,
      limit: 'review-order',
    })
    if (!guard.ok) return guard.response

    const parsed = reviewOrderSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const { reviewOrder } = await import('@/collection/settlement')
      const order = await reviewOrder(await collectionDb(), {
        reviewerId: guard.session.userId,
        ...parsed.data,
      })
      return { status: order.status }
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/** 管理员读取收款账户。 */
export const fetchCollectionAccountsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CollectionAccountRow[] | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { requireAdmin: true })
    if (!guard.ok) return guard.response

    try {
      const [{ createDb, schema }, { getServerContext }] = await Promise.all([
        import('@/db'),
        import('@/lib/server-context'),
      ])
      const db = createDb(getServerContext().env.DB)
      return await db.select().from(schema.collectionAccounts)
    } catch (error) {
      return failureResponse(error)
    }
  },
)

/**
 * 管理员保存收款账户（按 ID upsert）。
 *
 * 数据库只是「覆盖」：账户清单仍在源码配置里，这里改的是显示名、二维码与启用
 * 状态。数据库里没有的账户会补一行。
 */
export const saveCollectionAccountFn = createServerFn({ method: 'POST' }).handler(
  async ({ data }): Promise<{ ok: true } | Response> => {
    const guard = await guardCollectionRequest(await guardDeps(), { requireAdmin: true })
    if (!guard.ok) return guard.response

    const parsed = collectionAccountSchema.safeParse(data)
    if (!parsed.success) return errorResponse('INVALID_INPUT')

    try {
      const [{ createDb, schema }, { getServerContext }] = await Promise.all([
        import('@/db'),
        import('@/lib/server-context'),
      ])
      const db = createDb(getServerContext().env.DB)
      const now = new Date()
      await db
        .insert(schema.collectionAccounts)
        .values({
          id: parsed.data.accountId,
          channel: 'alipay',
          displayName: parsed.data.displayName,
          currency: 'cny',
          qrImageKey: parsed.data.qrImageKey ?? null,
          enabled: parsed.data.enabled,
          updatedBy: guard.session.userId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.collectionAccounts.id,
          set: {
            displayName: parsed.data.displayName,
            qrImageKey: parsed.data.qrImageKey ?? null,
            enabled: parsed.data.enabled,
            updatedBy: guard.session.userId,
            updatedAt: now,
          },
        })
      return { ok: true }
    } catch (error) {
      return failureResponse(error)
    }
  },
)
