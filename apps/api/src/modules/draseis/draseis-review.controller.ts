import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisDossierService } from './draseis-dossier.service';
import { DraseisReviewService } from './draseis-review.service';
import { SetReviewAnswersDto, SetReviewQuestionsDto } from './dto/drasi-review.dto';

/** Αξιολόγηση και ντοσιέ μιας δράσης. */
@ApiTags('Δράσεις — αξιολόγηση & ντοσιέ')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('draseis/:id')
export class DraseisReviewController {
  constructor(
    private readonly review: DraseisReviewService,
    private readonly dossiers: DraseisDossierService,
  ) {}

  @Get('review')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Ερωτήσεις, οι απαντήσεις μου και (για τον υπεύθυνο) η σύνοψη' })
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.view(user, id);
  }

  @Put('review/questions')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Τα θέματα της αξιολόγησης — τα φτιάχνουν τα στελέχη' })
  setQuestions(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetReviewQuestionsDto) {
    return this.review.setQuestions(user, id, dto);
  }

  @Put('review/answers')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Οι απαντήσεις μου (επώνυμες)' })
  setAnswers(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetReviewAnswersDto) {
    return this.review.setAnswers(user, id, dto);
  }

  @Get('dossier')
  @RequireCapability('calendar:read')
  @ApiQuery({ name: 'health', required: false, description: '1 ⇒ μαζί με τη σύνοψη υγείας (καταγράφεται).' })
  @ApiQuery({ name: 'treasury', required: false, description: '1 ⇒ μαζί με το ταμείο.' })
  @ApiOperation({ summary: 'Όλα τα δεδομένα του ντοσιέ σε ένα request' })
  dossier(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('health') health?: string,
    @Query('treasury') treasury?: string,
  ) {
    return this.dossiers.build(user, id, { health: health === '1', treasury: treasury !== '0' });
  }
}
