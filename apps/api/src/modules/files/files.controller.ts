import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MAX_RECEIPT_BYTES } from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { UploadFileDto } from './dto/files.dto';
import { FilesService } from './files.service';

@ApiTags('Αρχεία')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @RequireCapability('calendar:read')
  // Τα uploads είναι τα ακριβότερα αιτήματα (μνήμη + S3): δικό τους όριο.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ανέβασμα αρχείου (π.χ. απόδειξη)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES } }))
  upload(
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.files.upload(user, dto, file);
  }

  @Get(':id')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Κατέβασμα/προβολή αρχείου (stream μέσω backend)' })
  async download(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.files.openForDownload(user, id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    // Περιεχόμενο που ανέβασε χρήστης, σερβιρισμένο από το origin του API:
    // το `sandbox` το απομονώνει (κανένα script, καμία πρόσβαση σε origin) ακόμη
    // κι αν ένα PDF/εικόνα κρύβει κάτι που ο έλεγχος τύπου δεν έπιασε.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    file.stream.pipe(res);
  }

  @Delete(':id')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Διαγραφή αρχείου' })
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.files.remove(user, id);
    await this.audit.record(user, 'file.delete', 'stored_file', id);
    return result;
  }
}
