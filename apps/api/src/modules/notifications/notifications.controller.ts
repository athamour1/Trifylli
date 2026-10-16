import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { NotificationKind } from '@trifylli/shared';
import { CurrentUser } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { NotificationSettingDto, PushEndpointDto, PushSubscriptionDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** Το καμπανάκι, οι ρυθμίσεις ανά είδος, και οι συσκευές για push — πάντα του συνδεδεμένου χρήστη. */
@ApiTags('Ειδοποιήσεις')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Οι τελευταίες ειδοποιήσεις και πόσες είναι αδιάβαστες' })
  list(@CurrentUser() user: RequestUser) {
    return this.notifications.list(user);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Όλες διαβάστηκαν' })
  async readAll(@CurrentUser() user: RequestUser) {
    await this.notifications.markAllRead(user);
    return { ok: true };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Διαβάστηκε' })
  async read(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user, id);
    return { ok: true };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Τα είδη ειδοποιήσεων, ανοιχτά ή κλειστά' })
  settings(@CurrentUser() user: RequestUser) {
    return this.notifications.settings(user);
  }

  @Put('settings/:kind')
  @ApiOperation({ summary: 'Ένα είδος ανοιχτό ή κλειστό' })
  async setSetting(@CurrentUser() user: RequestUser, @Param('kind') kind: NotificationKind, @Body() dto: NotificationSettingDto) {
    await this.notifications.setSetting(user, kind, dto.enabled);
    return { ok: true };
  }

  @Get('push/key')
  @ApiOperation({ summary: 'Το δημόσιο κλειδί VAPID — κενό όταν το push δεν είναι ρυθμισμένο' })
  pushKey() {
    return this.notifications.pushKey();
  }

  @Post('push')
  @ApiOperation({ summary: 'Αυτή η συσκευή θέλει push' })
  async subscribe(@CurrentUser() user: RequestUser, @Body() dto: PushSubscriptionDto) {
    await this.notifications.subscribe(user, { endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth });
    return { ok: true };
  }

  @Post('push/remove')
  @ApiOperation({ summary: 'Αυτή η συσκευή δεν θέλει πια push (και στο logout)' })
  async unsubscribe(@CurrentUser() user: RequestUser, @Body() dto: PushEndpointDto) {
    await this.notifications.unsubscribe(user, dto.endpoint);
    return { ok: true };
  }
}
