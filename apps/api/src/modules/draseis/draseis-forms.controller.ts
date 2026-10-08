import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DrasiFormType } from '@trifylli/shared';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, Public, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisFormsService } from './draseis-forms.service';
import { DraseisPharmacyService } from './draseis-pharmacy.service';
import { IssueFormsDto, SetPharmacyKitsDto, SubmitFormDto } from './dto/drasi-forms.dto';

/** Έντυπα και φαρμακείο μιας δράσης — για τα στελέχη. */
@ApiTags('Δράσεις — έντυπα & φαρμακείο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisFormsController {
  constructor(
    private readonly forms: DraseisFormsService,
    private readonly pharmacies: DraseisPharmacyService,
    private readonly audit: AuditService,
  ) {}

  @Get('forms')
  @RequireDrasi('entypa')
  @ApiOperation({ summary: 'Παιδιά × έντυπα, με κατάσταση — «4 από 41 εκκρεμούν»' })
  matrix(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.matrix(user, id);
  }

  @Post('forms/issue')
  @RequireDrasi('entypa', 'edit')
  @ApiOperation({ summary: 'Έκδοση συνδέσμων — το token επιστρέφεται μία φορά' })
  issue(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueFormsDto) {
    return this.forms.issue(user, id, dto);
  }

  // Πριν από το `forms/:formId`: αλλιώς το «export.pdf» θα έπεφτε στο ParseUUIDPipe.
  @Get('forms/export.pdf')
  @RequireDrasi('entypa')
  @ApiQuery({ name: 'type', enum: DrasiFormType })
  @ApiOperation({ summary: 'Όλα τα συμπληρωμένα έντυπα ενός είδους — τα πρωτότυπα του Σ.Ε.Ο. συμπληρωμένα, σε ένα PDF' })
  async exportAll(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query('type') type: string, @Res() res: Response) {
    if (type !== DrasiFormType.SYMMETOXI && type !== DrasiFormType.YGEIA) throw new BadRequestException('Άγνωστο είδος εντύπου.');
    sendPdf(res, await this.forms.pdfAll(user, id, type));
  }

  @Get('forms/:formId/pdf')
  @RequireDrasi('entypa')
  @ApiOperation({ summary: 'Το έντυπο όπως το πρωτότυπο του Σ.Ε.Ο., συμπληρωμένο και υπογεγραμμένο' })
  async exportOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('formId', ParseUUIDPipe) formId: string, @Res() res: Response) {
    sendPdf(res, await this.forms.pdf(user, id, formId));
  }

  @Get('forms/:formId')
  @RequireDrasi('entypa')
  @ApiOperation({ summary: 'Οι απαντήσεις ενός εντύπου (η ανάγνωση ιατρικών καταγράφεται)' })
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('formId', ParseUUIDPipe) formId: string) {
    return this.forms.view(user, id, formId);
  }

  @Delete('forms/:formId')
  @RequireDrasi('entypa', 'edit')
  @ApiOperation({ summary: 'Ακύρωση συνδέσμου' })
  void(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('formId', ParseUUIDPipe) formId: string) {
    return this.forms.void(user, id, formId);
  }

  @Get('health')
  @RequireDrasi('farmakeio')
  @ApiOperation({ summary: 'Σύνοψη υγείας για την τσάντα πρώτων βοηθειών (καταγράφεται)' })
  health(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.forms.healthSummary(user, id);
  }

  @Get('pharmacy')
  @RequireDrasi('farmakeio')
  @ApiOperation({ summary: 'Φαρμακεία της δράσης και ποια μπορούν να της ανατεθούν' })
  pharmacy(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharmacies.view(user, id);
  }

  @Put('pharmacy')
  @RequireDrasi('farmakeio', 'edit')
  @ApiOperation({ summary: 'Ποια φαρμακεία έχει η δράση (αντικατάσταση)' })
  async setPharmacy(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPharmacyKitsDto) {
    const result = await this.pharmacies.setKits(user, id, dto.kitIds);
    await this.audit.record(user, 'drasi.pharmacy.set', 'drasi', id, { kits: dto.kitIds.length });
    return result;
  }
}

/**
 * Η δημόσια πλευρά: ο γονέας με τον σύνδεσμό του. Χωρίς συνεδρία, με αυστηρό
 * όριο ρυθμού — ένας σύνδεσμος που μαντεύεται δεν υπάρχει (256 bit), αλλά το
 * endpoint δεν χρειάζεται να εξυπηρετεί και καταιγίδες.
 */
@ApiTags('Έντυπα (δημόσια)')
@Controller('forms')
export class PublicFormsController {
  constructor(private readonly forms: DraseisFormsService) {}

  @Get(':token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Το έντυπο όπως το βλέπει ο γονέας' })
  open(@Param('token') token: string, @Ip() ip: string) {
    return this.forms.open(token, ip);
  }

  @Post(':token')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Υποβολή — ο σύνδεσμος παύει να ισχύει' })
  submit(@Param('token') token: string, @Body() dto: SubmitFormDto, @Ip() ip: string) {
    return this.forms.submit(token, dto, ip);
  }
}

function sendPdf(res: Response, file: { filename: string; buffer: Buffer }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(file.buffer);
}
