import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { COLLAB_CLIENT_HEADER } from '@trifylli/shared';
import { CurrentUser } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DocumentQueryDto } from './dto/history.dto';
import { CollabHistoryService } from './collab-history.service';
import { clientOrigin } from './live-changes';

/**
 * Το ιστορικό των κοινών εγγράφων και το «Το διάβασαν». Τα δικαιώματα είναι του
 * εγγράφου: βλέπει όποιος το βλέπει, επαναφέρει όποιος το γράφει.
 */
@ApiTags('Ιστορικό εγγράφων')
@ApiBearerAuth()
@Controller()
export class CollabHistoryController {
  constructor(private readonly history: CollabHistoryService) {}

  @Get('versions')
  @ApiOperation({ summary: 'Οι εκδόσεις ενός εγγράφου, νεότερη πρώτη' })
  list(@CurrentUser() user: RequestUser, @Query() query: DocumentQueryDto) {
    return this.history.list(user, query.document);
  }

  @Get('versions/:id')
  @ApiOperation({ summary: 'Μια έκδοση, με την προηγούμενη για σύγκριση' })
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.history.get(user, id);
  }

  @Post('versions/:id/restore')
  @ApiOperation({ summary: 'Επαναφορά — ως νέα αλλαγή, για όλους' })
  restore(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Headers(COLLAB_CLIENT_HEADER) client?: string) {
    return this.history.restore(user, id, clientOrigin(client));
  }

  @Get('reads')
  @ApiOperation({ summary: '«Το διάβασαν»: ποιοι άνοιξαν την τελευταία έκδοση' })
  readers(@CurrentUser() user: RequestUser, @Query() query: DocumentQueryDto) {
    return this.history.readers(user, query.document);
  }

  @Post('reads')
  @ApiOperation({ summary: 'Το άνοιξα — την τελευταία έκδοση' })
  async read(@CurrentUser() user: RequestUser, @Body() dto: DocumentQueryDto) {
    await this.history.read(user, dto.document);
    return { ok: true };
  }
}
