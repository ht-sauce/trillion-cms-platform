import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadRequestException, Module, ValidationPipe } from '@nestjs/common'
import { DemandsService } from './demands.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CaptchaService } from './captcha.service'
import { RateLimitService } from './rate-limit.service'
import { DemandsController } from './demands.controller'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { NestFactory } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor'
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { SubmitDemandDto } from './dto'

test('后台跟进与封禁路径对齐现有管理后台契约', () => {
  assert.equal(Reflect.getMetadata(PATH_METADATA, DemandsController.prototype.update), ':id/follow-up')
  assert.equal(Reflect.getMetadata(PATH_METADATA, DemandsController.prototype.createBan), 'ip-bans')
  assert.equal(Reflect.getMetadata(PATH_METADATA, DemandsController.prototype.removeBan), 'ip-bans/:ip')
})

test('不可信代理转发 Host 不参与站点来源解析，矛盾来源拒绝', async () => {
  const service = { createCaptcha: async (context: { siteKeys: string[] }) => context } as unknown as DemandsService
  const controller = new DemandsController(service, { get: () => [] } as unknown as ConfigService)
  const request = {
    socket: { remoteAddress: '203.0.113.1' },
    headers: { host: 'example.com', 'x-forwarded-host': 'forged.example' }
  } as unknown as Request
  assert.deepEqual(((await controller.captcha(request)) as unknown as { siteKeys: string[] }).siteKeys, ['example.com'])
  request.headers.origin = 'https://example.com'
  request.headers.referer = 'https://other.example/contact'
  assert.throws(() => controller.captcha(request), BadRequestException)
})

test('验证码仅保存成功后消耗，5 次错误和有效期不变', () => {
  const captcha = new CaptchaService()
  const ip = '203.0.113.1'
  const challenge = captcha.create(ip)
  const svg = Buffer.from(challenge.image.split(',')[1], 'base64').toString()
  const answer = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]).join('')
  assert.equal(captcha.verify(challenge.id, answer, ip), 'ok')
  assert.equal(captcha.verify(challenge.id, answer, ip), 'ok')
  captcha.consume(challenge.id, ip)
  assert.equal(captcha.verify(challenge.id, answer, ip), 'missing')
  const wrong = captcha.create(ip)
  for (let i = 0; i < 5; i += 1) assert.equal(captcha.verify(wrong.id, 'invalid', ip), 'wrong')
  assert.equal(captcha.verify(wrong.id, 'invalid', ip), 'missing')
})

test('可选邮箱允许空白，需求和幂等标识 trim 后校验', async () => {
  const dto = plainToInstance(SubmitDemandDto, { ...submission, email: '   ' })
  assert.deepEqual(await validate(dto), [])
  assert.ok((await validate(plainToInstance(SubmitDemandDto, { ...submission, description: '  ' }))).length)
})

test('唯一键并发冲突返回已保存记录，而其它数据库错误继续抛出', async () => {
  let reads = 0
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: { findFirst: async () => ({ id: 'site-1' }) },
    demandSubmission: {
      findUnique: async () => (++reads === 1 ? null : { id: 'winner', createdAt: new Date() }),
      create: async () => {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
    }
  } as unknown as PrismaService
  const captcha = { verify: () => 'ok', consume: () => assert.fail('不能消耗未保存挑战') } as unknown as CaptchaService
  const result = await new DemandsService(prisma, captcha, new RateLimitService()).submit(submission, {
    ip: '203.0.113.1',
    siteKeys: ['example.com']
  })
  assert.equal(result.id, 'winner')
  assert.equal(result.duplicated, true)
})

test('并发刷新验证码第 21 次起限流，第 61 次自动封禁且不延长', async () => {
  let ban: Record<string, unknown> | null = null
  let bans = 0
  const prisma = {
    geoIpBan: {
      findUnique: async () => ban,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        bans += 1
        ban = data
        return data
      }
    },
    site: { findFirst: async () => ({ id: 'site-1' }) }
  } as unknown as PrismaService
  const service = new DemandsService(prisma, new CaptchaService(), new RateLimitService())
  const results = await Promise.allSettled(
    Array.from({ length: 61 }, () =>
      service.createCaptcha({
        ip: '203.0.113.1',
        siteKeys: ['example.com']
      })
    )
  )
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 20)
  const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[]
  assert.equal(failures.filter((result) => result.reason.getStatus() === 429).length, 40)
  assert.equal(failures[40].reason.getStatus(), 403)
  await assert.rejects(service.createCaptcha({ ip: '203.0.113.1', siteKeys: ['example.com'] }))
  assert.equal(bans, 1)
})

test('人工封禁优先且解禁按 IP 返回并清空计数', async () => {
  let ban: Record<string, unknown> | null = { id: 'ban-1', ip: '203.0.113.1', source: 'manual', expiresAt: new Date(0) }
  const prisma = {
    geoIpBan: {
      findUnique: async () => ban,
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { ip: '203.0.113.1' })
        ban = null
      }
    }
  } as unknown as PrismaService
  const limits = new RateLimitService()
  limits.hit('203.0.113.1', 'wrong', 600000)
  const service = new DemandsService(prisma, new CaptchaService(), limits)
  await assert.rejects(
    service.createCaptcha({ ip: '203.0.113.1', siteKeys: ['example.com'] }),
    (error: unknown) => (error as { getStatus(): number }).getStatus() === 403
  )
  assert.deepEqual(await service.removeBan('::ffff:203.0.113.1'), { ip: '203.0.113.1' })
  assert.equal(limits.count('203.0.113.1', 'wrong', 600000), 0)
})

test('HTTP 路由、菜单鉴权、widget、提交重试、详情及跟进契约', async () => {
  const site = { id: 'site-1', name: '站点一', slug: 'site-one' }
  const id = '019a5780-0000-7000-8000-000000000001'
  const now = new Date()
  let saved: Record<string, unknown> | null = null
  let allowed = true
  const prisma = {
    site: { findFirst: async () => site, findUnique: async () => site },
    geoIpBan: { findUnique: async () => null },
    menu: {
      findFirst: async ({ where }: { where: { path: string } }) => {
        assert.equal(where.path, '/sites/demands')
        return { id: 'menu-1' }
      }
    },
    roleMenu: { findUnique: async () => (allowed ? { roleId: 'role-1' } : null) },
    demandSubmission: {
      findUnique: async () => saved,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saved = { id, ...data, status: 'pending', note: null, createdAt: now, updatedAt: now }
        return saved
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        saved = { ...saved, ...data }
        return saved
      }
    }
  }
  const jwt = new JwtService({ secret: 'local-contract-test-secret' })
  @Module({
    controllers: [DemandsController],
    providers: [
      DemandsService,
      CaptchaService,
      RateLimitService,
      { provide: PrismaService, useValue: prisma },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => (key === 'jwt.secret' ? 'local-contract-test-secret' : []) }
      },
      { provide: JwtService, useValue: jwt }
    ]
  })
  class ContractModule {}
  const app = await NestFactory.create<NestExpressApplication>(ContractModule, { logger: false })
  app.setGlobalPrefix('geoserver')
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalFilters(new HttpExceptionFilter())
  await app.listen(0, '127.0.0.1')
  try {
    const base = await app.getUrl()
    const headers = { origin: 'https://example.com', 'content-type': 'application/json' }
    const configResponse = await fetch(`${base}/geoserver/demands/widget-config`, { headers })
    assert.equal(configResponse.status, 200)
    const config = (await configResponse.json()) as { data: Record<string, unknown> }
    assert.equal(config.data.widgetKey, 'site-one')
    assert.equal(config.data.siteName, '站点一')
    const captchaResponse = await fetch(`${base}/geoserver/demands/captcha`, { headers })
    assert.equal(captchaResponse.headers.get('cache-control'), 'no-store')
    assert.equal(captchaResponse.headers.get('x-robots-tag'), 'noindex')
    const challenge = ((await captchaResponse.json()) as { data: { id: string; image: string } }).data
    const svg = Buffer.from(challenge.image.split(',')[1], 'base64').toString()
    const answer = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]).join('')
    const payload = { ...submission, captchaId: challenge.id, captchaCode: answer, siteId: 'forged-site', email: '  ' }
    for (const duplicated of [false, true]) {
      const response = await fetch(`${base}/geoserver/demands/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })
      assert.equal(response.status, 200)
      assert.equal(((await response.json()) as { data: { duplicated: boolean } }).data.duplicated, duplicated)
    }
    const unauthorized = await fetch(`${base}/geoserver/demands/${id}`)
    assert.equal(unauthorized.status, 401)
    const authorization = `Bearer ${await jwt.signAsync({ sub: 'user-1', roleId: 'role-1', siteIds: [] })}`
    const detail = await fetch(`${base}/geoserver/demands/${id}`, { headers: { authorization } })
    assert.equal(detail.status, 200)
    const data = ((await detail.json()) as { data: Record<string, unknown> }).data
    assert.equal(data.siteId, 'site-1')
    assert.equal(data.clientIp, '127.0.0.1')
    assert.equal(data.ban, null)
    assert.equal('submitKey' in data, false)
    const follow = await fetch(`${base}/geoserver/demands/${id}/follow-up`, {
      method: 'PATCH',
      headers: { ...headers, authorization },
      body: JSON.stringify({ status: 'followed', note: '<text>内部备注</text>' })
    })
    assert.equal(follow.status, 200)
    assert.equal(((await follow.json()) as { data: { status: string } }).data.status, 'followed')
    allowed = false
    assert.equal((await fetch(`${base}/geoserver/demands/${id}`, { headers: { authorization } })).status, 403)
  } finally {
    await app.close()
  }
})

const submission = {
  description: '咨询网站建设方案',
  otherContact: '请电话联系',
  submitKey: 'retry-key-001',
  captchaId: 'challenge-001',
  captchaCode: 'ABCD'
}

test('成功幂等重试不再验证已消耗的验证码', async () => {
  let verified = false
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: { findFirst: async () => ({ id: 'site-1' }) },
    demandSubmission: { findUnique: async () => ({ id: 'saved', createdAt: new Date() }) }
  } as unknown as PrismaService
  const captcha = {
    verify: () => {
      verified = true
      return 'missing'
    }
  } as unknown as CaptchaService
  const result = await new DemandsService(prisma, captcha, new RateLimitService()).submit(submission, {
    ip: '203.0.113.1',
    siteKeys: ['example.com']
  })
  assert.equal(result.duplicated, true)
  assert.equal(verified, false)
})

test('并发同提交标识只保存一次，验证码在保存成功后消耗', async () => {
  let saved: { id: string; createdAt: Date } | null = null
  let creates = 0
  let consumed = 0
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: { findFirst: async () => ({ id: 'site-1' }) },
    demandSubmission: {
      findUnique: async () => saved,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(consumed, 0)
        assert.equal(data.clientIp, '203.0.113.1')
        creates += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        saved = { id: 'saved', createdAt: new Date() }
        return saved
      }
    }
  } as unknown as PrismaService
  const captcha = {
    verify: () => 'ok',
    consume: () => {
      consumed += 1
    }
  } as unknown as CaptchaService
  const service = new DemandsService(prisma, captcha, new RateLimitService())
  const results = await Promise.all(
    Array.from({ length: 2 }, () =>
      service.submit(submission, {
        ip: '203.0.113.1',
        siteKeys: ['example.com']
      })
    )
  )
  assert.equal(creates, 1)
  assert.equal(consumed, 1)
  assert.deepEqual(results.map((item) => item.duplicated).sort(), [false, true])
})

test('不接受来源候选回退到其它站点或 slug', async () => {
  let lookups = 0
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: {
      findFirst: async () => {
        lookups += 1
        return lookups === 1 ? null : { id: 'site-2' }
      }
    },
    demandSubmission: { findUnique: async () => null, create: async () => ({ id: 'saved', createdAt: new Date() }) }
  } as unknown as PrismaService
  const service = new DemandsService(
    prisma,
    { verify: () => 'ok' } as unknown as CaptchaService,
    new RateLimitService()
  )
  await assert.rejects(
    service.submit(submission, {
      ip: '203.0.113.1',
      siteKeys: ['unknown.example', 'other.example']
    }),
    BadRequestException
  )
  assert.equal(lookups, 1)
})

test('保存失败不消耗验证码且不累计猜错', async () => {
  let consumed = 0
  const limits = new RateLimitService()
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: { findFirst: async () => ({ id: 'site-1' }) },
    demandSubmission: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('database unavailable')
      }
    }
  } as unknown as PrismaService
  const captcha = {
    verify: () => 'ok',
    consume: () => {
      consumed += 1
    }
  } as unknown as CaptchaService
  await assert.rejects(
    new DemandsService(prisma, captcha, limits).submit(submission, {
      ip: '203.0.113.1',
      siteKeys: ['example.com']
    }),
    /database unavailable/
  )
  assert.equal(consumed, 0)
  assert.equal(limits.count('203.0.113.1', 'wrong', 600000), 0)
})

test('公开提交要求至少提供一种联系方式，且不写入无效记录', async () => {
  let created = false
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: { findFirst: async () => ({ id: 'site-1' }) },
    demandSubmission: {
      findUnique: async () => null,
      create: async () => {
        created = true
      }
    }
  } as unknown as PrismaService
  const captcha = { verify: () => 'ok' } as unknown as CaptchaService
  const service = new DemandsService(prisma, captcha, new RateLimitService())

  await assert.rejects(
    service.submit(
      {
        description: '需要咨询企业网站建设方案',
        submitKey: 'submit-key-001',
        captchaId: 'captcha-id',
        captchaCode: 'ABCD'
      },
      { ip: '203.0.113.1', siteKeys: ['example.com'] }
    ),
    BadRequestException
  )
  assert.equal(created, false)
})

test('公开提交按来源域名解析站点，并以站点和 submitKey 保证幂等', async () => {
  const createdAt = new Date('2026-11-06T02:00:00.000Z')
  let createData: Record<string, unknown> | undefined
  const prisma = {
    geoIpBan: { findUnique: async () => null },
    site: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, {
          status: 'active',
          OR: [{ domain: 'example.com' }, { domains: { some: { domain: 'example.com' } } }]
        })
        return { id: 'site-1' }
      }
    },
    demandSubmission: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createData = data
        return { id: 'demand-1', createdAt }
      }
    }
  } as unknown as PrismaService
  const captcha = { verify: () => 'ok', consume: () => {} } as unknown as CaptchaService
  const service = new DemandsService(prisma, captcha, new RateLimitService())

  const result = await service.submit(
    {
      description: '需要咨询企业网站建设方案',
      phone: '13800138000',
      submitKey: 'submit-key-001',
      captchaId: 'captcha-id',
      captchaCode: 'ABCD',
      sourceUrl: 'https://example.com/contact?from=ad#form'
    },
    { ip: '203.0.113.1', siteKeys: ['example.com'] }
  )

  assert.equal(createData?.siteId, 'site-1')
  assert.equal(createData?.sourceUrl, 'https://example.com/contact')
  assert.deepEqual(result, { id: 'demand-1', duplicated: false, createdAt: '2026-11-06 10:00:00' })
})

test('后台跟进列表使用统一分页档位并格式化业务时间', async () => {
  const prisma = {
    site: { findUnique: async () => ({ name: '站点一' }) },
    geoIpBan: { findUnique: async () => null },
    demandSubmission: {
      findMany: async ({ skip, take }: { skip: number; take: number }) => {
        assert.equal(skip, 0)
        assert.equal(take, 20)
        return [
          {
            id: 'demand-1',
            siteId: 'site-1',
            description: '需求',
            contactName: null,
            phone: '13800138000',
            wechat: null,
            email: null,
            otherContact: null,
            sourceUrl: null,
            clientIp: '203.0.113.1',
            status: 'pending',
            note: null,
            createdAt: new Date('2026-11-06T02:00:00.000Z'),
            updatedAt: new Date('2026-11-06T03:00:00.000Z')
          }
        ]
      },
      count: async () => 1
    }
  } as unknown as PrismaService
  const service = new DemandsService(prisma, null!, new RateLimitService())
  const result = await service.list({ page: 'invalid', pageSize: '999' })

  assert.equal(result.page, 1)
  assert.equal(result.pageSize, 20)
  assert.equal(result.list[0].createdAt, '2026-11-06 10:00:00')
  assert.equal(result.list[0].updatedAt, '2026-11-06 11:00:00')
  assert.equal(result.list[0].siteName, '站点一')
  assert.equal(result.list[0].ban, null)
})
