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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MAX_RECEIPT_BYTES } from '@trifylli/shared';
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
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequireCapability('calendar:read')
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
    file.stream.pipe(res);
  }

  @Delete(':id')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Διαγραφή αρχείου' })
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.remove(user, id);
  }
}
