import { Global, Module, type Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AppConfigToken } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { CapabilityGuard } from './capability.guard';
import { DevAuthService } from './dev-auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { UserDirectoryService } from './user-directory.service';

/**
 * Κάθε στρατηγική δηλώνεται μόνο όταν χρειάζεται: με ενεργό bypass δεν έχει νόημα
 * να χτυπάμε το JWKS endpoint ενός Authentik που μπορεί και να μην τρέχει, και
 * αντίστροφα ο dev πάροχος δεν πρέπει να υπάρχει καν σε production.
 */
const jwtStrategyProvider: Provider = {
  provide: JwtStrategy,
  inject: [AppConfigToken, UserDirectoryService],
  useFactory: (config: AppConfig, directory: UserDirectoryService) =>
    config.DEV_AUTH_BYPASS ? null : new JwtStrategy(config, directory),
};

const devAuthProvider: Provider = {
  provide: DevAuthService,
  inject: [AppConfigToken, UserDirectoryService],
  useFactory: (config: AppConfig, directory: UserDirectoryService) =>
    config.DEV_AUTH_BYPASS ? new DevAuthService(config, directory) : null,
};

const jwtGuardProvider: Provider = {
  provide: JwtAuthGuard,
  inject: [Reflector, AppConfigToken, DevAuthService],
  useFactory: (reflector: Reflector, config: AppConfig, devAuth: DevAuthService | null) =>
    new JwtAuthGuard(reflector, config, devAuth),
};

@Global()
@Module({
  imports: [PassportModule],
  providers: [
    UserDirectoryService,
    jwtStrategyProvider,
    devAuthProvider,
    jwtGuardProvider,
    CapabilityGuard,
  ],
  exports: [UserDirectoryService, CapabilityGuard, JwtAuthGuard],
})
export class AuthModule {}
