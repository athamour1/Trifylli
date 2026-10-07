import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { KladosType, SymvoulioType } from '@trifylli/shared';

export class CreateSymvoulioDto {
  @ApiProperty({ enum: SymvoulioType })
  @IsEnum(SymvoulioType)
  type!: SymvoulioType;

  @ApiPropertyOptional({
    enum: KladosType,
    description: 'Απαιτείται για συμβούλια κλάδου, απαγορεύεται για συμβούλια Τοπικού.',
  })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ποιος προεδρεύει.' })
  @IsOptional()
  @IsUUID()
  chairId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Συμβούλιο προετοιμασίας δράσης.' })
  @IsOptional()
  @IsUUID()
  drasiId?: string;
}

export class UpdateSymvoulioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  chairId?: string;

  @ApiPropertyOptional({ description: 'Τι θα συζητηθεί — Markdown, γράφεται πριν.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  agenda?: string;

  @ApiPropertyOptional({ description: 'Τι ειπώθηκε — Markdown, γράφεται κατά τη διάρκεια.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  minutes?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Τα στελέχη που συμμετείχαν. Η παράλειψη αφήνει τη λίστα ως έχει.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  participantIds?: string[];
}
