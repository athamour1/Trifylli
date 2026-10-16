import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DrasiRoleKind } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ANNOUNCEMENT_MAX } from '@trifylli/shared';

/** Νέα ανακοίνωση: σε όλα τα στελέχη ή σε ρόλους του αρχηγείου. */
export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  @MaxLength(ANNOUNCEMENT_MAX)
  body!: string;

  @ApiPropertyOptional({ enum: DrasiRoleKind, isArray: true, description: 'Κενό = όλα τα στελέχη της δράσης' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(DrasiRoleKind, { each: true })
  roles?: DrasiRoleKind[];
}

/** «Τις είδα». */
export class SeenAnnouncementsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
