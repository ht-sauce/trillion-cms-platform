/**
 * 应用根模块
 * 配置模块全局注入并通过 zod 校验；Prisma 全局可用；业务模块在此集中注册
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from './config/configuration'
import { validateEnv } from './config/env.validation'
import { PrismaModule } from './prisma/prisma.module'
import { CommonModule } from './common/common.module'
import { AuthModule } from './modules/auth/auth.module'
import { SitesModule } from './modules/sites/sites.module'
import { StaticFilesModule } from './modules/static-files/static-files.module'
import { ContentModule } from './modules/content/content.module'
import { NewsFaqModule } from './modules/news-faq/news-faq.module'
import { MembersModule } from './modules/members/members.module'
import { PublishModule } from './modules/publish/publish.module'
import { TrackModule } from './modules/track/track.module'
import { HealthModule } from './modules/health/health.module'
import { PublicModule } from './modules/public/public.module'
import { EntitiesModule } from './modules/entities/entities.module'
import { SiteAuthModule } from './modules/site-auth/site-auth.module'
import { MenusModule } from './modules/menus/menus.module'
import { RolesModule } from './modules/roles/roles.module'
import { AdminUsersModule } from './modules/admin-users/admin-users.module'
import { BlocksModule } from './modules/blocks/blocks.module'
import { NavigationModule } from './modules/navigation/navigation.module'
import { PreviewModule } from './modules/preview/preview.module'
import { GeoModule } from './modules/geo/geo.module'

@Module({
  imports: [
    /**
     * 环境变量统一来自仓库根 env/ 目录，由启动器（pnpm allDev / pnpm dev:server）注入进程，
     * 因此不再读取工程内 .env（避免多份事实来源）；缺失由 validateEnv 直接报错
     */
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      ignoreEnvFile: true
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    SitesModule,
    StaticFilesModule,
    ContentModule,
    NewsFaqModule,
    MembersModule,
    PublishModule,
    TrackModule,
    EntitiesModule,
    SiteAuthModule,
    MenusModule,
    RolesModule,
    AdminUsersModule,
    HealthModule,
    PublicModule,
    BlocksModule,
    NavigationModule,
    PreviewModule,
    GeoModule
  ]
})
export class AppModule {}
