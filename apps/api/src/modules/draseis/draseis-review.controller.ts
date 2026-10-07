import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisDossierService } from './draseis-dossier.service';
import { DraseisReviewService } from './draseis-review.service';
import { SetReviewAnswersDto, SetReviewQuestionsDto, UpdateReviewSettingsDto } from './dto/drasi-review.dto';

/** Αξιολόγηση (φόρμα) και ντοσιέ μιας δράσης. */
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
  @ApiOperation({ summary: 'Η φόρμα: ρυθμίσεις, ερωτήσεις, οι απαντήσεις μου και (για τον υπεύθυνο) σύνοψη & ατομικά' })
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.view(user, id);
  }

  @Put('review/questions')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Οι ερωτήσεις της φόρμας, με τη σειρά τους' })
  setQuestions(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetReviewQuestionsDto) {
    return this.review.setQuestions(user, id, dto);
  }

  @Patch('review/settings')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Ρυθμίσεις της φόρμας (αποδοχή απαντήσεων, ανωνυμία, κοινό…)' })
  updateSettings(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReviewSettingsDto) {
    return this.review.updateSettings(user, id, dto);
  }

  @Put('review/answers')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Η υποβολή μου — όλες οι απαντήσεις μαζί' })
  setAnswers(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetReviewAnswersDto) {
    return this.review.setAnswers(user, id, dto);
  }

  @Delete('review/responses/:key')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Διαγραφή μιας υποβολής' })
  removeResponse(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('key', ParseUUIDPipe) key: string) {
    return this.review.removeResponse(user, id, key);
  }

  @Get('review/export.xlsx')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Οι απαντήσεις σε Excel (μία γραμμή ανά απαντώντα + σύνοψη)' })
  async exportXlsx(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { filename, buffer } = await this.review.workbook(user, id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
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
