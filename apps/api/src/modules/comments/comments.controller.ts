import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { COLLAB_CLIENT_HEADER } from '@trifylli/shared';
import { CurrentUser } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { clientOrigin } from '../collab/live-changes';
import { CommentsQueryDto, CreateCommentDto, EditCommentDto, ResolveCommentDto } from './dto/comments.dto';
import { CommentsService } from './comments.service';

/**
 * Σχόλια στα κοινά έγγραφα. Τα δικαιώματα είναι του εγγράφου: όποιος το βλέπει
 * σχολιάζει, όποιος δεν το βλέπει δεν μαθαίνει ούτε ότι υπάρχει.
 */
@ApiTags('Σχόλια')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'Τα νήματα ενός εγγράφου, με τις απαντήσεις' })
  list(@CurrentUser() user: RequestUser, @Query() query: CommentsQueryDto) {
    return this.comments.list(user, query.document);
  }

  @Get('people')
  @ApiOperation({ summary: 'Τα στελέχη που αναφέρονται με «@» σε αυτό το έγγραφο' })
  people(@CurrentUser() user: RequestUser, @Query() query: CommentsQueryDto) {
    return this.comments.people(user, query.document);
  }

  @Post()
  @ApiOperation({ summary: 'Νέο σχόλιο (σε φράση, σε όλο το κείμενο) ή απάντηση' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCommentDto, @Headers(COLLAB_CLIENT_HEADER) client?: string) {
    return this.comments.create(user, dto, clientOrigin(client));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Νέο κείμενο — μόνο ο συντάκτης' })
  edit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditCommentDto,
    @Headers(COLLAB_CLIENT_HEADER) client?: string,
  ) {
    return this.comments.edit(user, id, dto, clientOrigin(client));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Διαγραφή — μόνο ο συντάκτης (με τις απαντήσεις)' })
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Headers(COLLAB_CLIENT_HEADER) client?: string) {
    await this.comments.remove(user, id, clientOrigin(client));
    return { ok: true };
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: '«Επιλύθηκε» ή ξανά ανοιχτό — όλο το νήμα' })
  resolve(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveCommentDto,
    @Headers(COLLAB_CLIENT_HEADER) client?: string,
  ) {
    return this.comments.resolve(user, id, dto.resolved, clientOrigin(client));
  }
}
