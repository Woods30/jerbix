import { createCacheKey, getOrSetCache } from '@/cache'
import { CACHE_TTL } from '@/cache/constants'
import { collectPriceReferences, findOfferByReference } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { getPaymentProvider, isPaymentProviderConfigured } from '@/payment'
import type { PriceCatalog } from './price-catalog'

export async function getPriceCatalog(): Promise<PriceCatalog> {
  const references = collectPriceReferences()
  if (!references.length) return {}
  // 没配支付渠道（模板工程出厂就没有 Stripe 账号）时返回空目录，而不是让
  // `getPaymentProvider` 抛错：llms.txt 与定价页都读这份目录，缺价格清单
  // 顶多让价格显示为空，整页 500 才是真故障。
  if (!isPaymentProviderConfigured(websiteConfig.payment.provider)) return {}
  return getOrSetCache({
    key: createCacheKey(
      'payment',
      'price-catalog-v3',
      websiteConfig.payment.provider,
      JSON.stringify(references),
    ),
    ttlSeconds: CACHE_TTL.priceCatalog,
    fetcher: async () => {
      const prices = await getPaymentProvider(websiteConfig.payment.provider).listPrices(references)
      const catalog: PriceCatalog = {}
      for (const price of prices) {
        if (!price.reference || price.amount === null) continue
        catalog[price.reference] = { ...price, priceId: price.id, amount: price.amount }
      }
      return catalog
    },
  })
}

export async function findProductIdByPriceId(priceId: string): Promise<string | undefined> {
  const catalog = await getPriceCatalog()
  const price = Object.values(catalog).find((item) => item.priceId === priceId)
  return price ? findOfferByReference(price.reference)?.productId : undefined
}
