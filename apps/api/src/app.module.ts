import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './common/auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AppConfigModule } from './common/config/config.module';
import { AuditModule } from './common/audit/audit.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthController } from './health.controller';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { DraseisModule } from './modules/draseis/draseis.module';
import { FarmakeioModule } from './modules/farmakeio/farmakeio.module';
import { PharmaciesModule } from './modules/pharmacies/pharmacies.module';
import { FilesModule } from './modules/files/files.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MeloiModule } from './modules/meloi/meloi.module';
import { ParousiologioModule } from './modules/parousiologio/parousiologio.module';
import { ProodosModule } from './modules/proodos/proodos.module';
import { SyggentrwseisModule } from './modules/syggentrwseis/syggentrwseis.module';
import { SymvouliaModule } from './modules/symvoulia/symvoulia.module';
import { SyndromesModule } from './modules/syndromes/syndromes.module';
import { TopikoModule } from './modules/topiko/topiko.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { YlikoModule } from './modules/yliko/yliko.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    StorageModule,
    AuthModule,
    ScheduleModule.forRoot(),
    // Η PWA συγχρονίζει ουρές μαζικά μετά από offline· το όριο είναι γενναιόδωρο
    // ώστε ένα κανονικό flush να μη χτυπά 429, αλλά κόβει runaway loops.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

    TopikoModule,
    AccountsModule,
    CalendarModule,
    MeloiModule,
    SyndromesModule,
    TreasuryModule,
    FilesModule,
    YlikoModule,
    DraseisModule,
    SyggentrwseisModule,
    ParousiologioModule,
    ProodosModule,
    SymvouliaModule,
    FarmakeioModule,
    PharmaciesModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
