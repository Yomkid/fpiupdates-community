import { IdentityController, IdentityAdminController } from './identity';
import { LaunchAdminController } from './launch-admin';
import { ContentController, ContentAdminController } from './site-content';
import { AdsController, AdsReviewController } from './ads';
import {
  PushService,
  PushController,
  InstallationController,
  PublicMetadataController,
} from './pwa';
import { FeatureSwitches, FeatureSwitchController, FeatureAccessGuard } from './feature-switches';
import { PeopleController } from './people';
import { MessagesController, MessageReportsController } from './messages';
import { GoogleAuthController, GoogleAuthService } from './google-auth';
import { ActivityController, ProfileAlertsController } from './activity';
import { SearchController } from './search';
import { SportsAccessGuard, SportsService, SportsController, SportsDeskController } from './sports';
import { DiscoveryFeedController, DiscoveryAdminController } from './discovery';
import { AnalyticsService, StatsController, AdminAnalyticsController } from './analytics';
import { DiscoveryController } from './text-entities';
import { PublishingController, PublishingService } from './publishing';
import { notificationThrottles } from './notification-throttle';
import { NotificationsController } from './notifications';
import { SafetyController } from './safety';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, SkipThrottle } from '@nestjs/throttler';
import { MediaController, MediaService } from './media';
import { LinkPreviewService, LinkPreviewController } from './link-previews';
import { Database } from './database';
import {
  AuthController,
  AuthService,
  SessionGuard,
  BrowserOriginGuard,
  OptionalSessionGuard,
} from './auth';
import { AdminController } from './admin';
import {
  SocialController,
  CatalogController,
  ProfileController,
  NavigationController,
} from './features';
import { ArticlesController, EditorialController } from './editorial';
import { RecoveryController } from './recovery';
import { RecoveryService } from './mail-tokens';
import { PermissionGuard, VerifiedGuard } from './permissions';
import { PostsController, PostsService, UsersController } from './posts';
@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Get() @SkipThrottle() live() {
    return { status: 'ok', service: 'fpiupdates-api' };
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 180 }, ...notificationThrottles])],
  controllers: [
    LaunchAdminController,
    IdentityController,
    IdentityAdminController,
    ContentController,
    ContentAdminController,
    AdsController,
    AdsReviewController,
    PushController,
    InstallationController,
    PublicMetadataController,
    FeatureSwitchController,
    PeopleController,
    MessagesController,
    MessageReportsController,
    GoogleAuthController,
    ActivityController,
    ProfileAlertsController,
    SearchController,
    SportsController,
    SportsDeskController,
    DiscoveryFeedController,
    DiscoveryAdminController,
    StatsController,
    AdminAnalyticsController,
    DiscoveryController,
    PublishingController,
    NotificationsController,
    SafetyController,
    LinkPreviewController,
    MediaController,
    HealthController,
    AuthController,
    PostsController,
    UsersController,
    AdminController,
    SocialController,
    CatalogController,
    ProfileController,
    NavigationController,
    ArticlesController,
    EditorialController,
    RecoveryController,
  ],
  providers: [
    PushService,
    FeatureSwitches,
    FeatureAccessGuard,
    GoogleAuthService,
    SportsAccessGuard,
    SportsService,
    AnalyticsService,
    PublishingService,
    LinkPreviewService,
    MediaService,
    RecoveryService,
    PermissionGuard,
    VerifiedGuard,
    Database,
    AuthService,
    SessionGuard,
    BrowserOriginGuard,
    OptionalSessionGuard,
    PostsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FeatureAccessGuard },
  ],
})
export class AppModule {}
