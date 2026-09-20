import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ProodosStatus } from '@trifylli/shared';

export class CreateGoalDto {
  @ApiProperty({ description: 'Σύντομος κωδικός, μοναδικός ανά κλάδο (π.χ. «Φ1»).' })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Ομαδοποίηση (π.χ. «Σώμα & Υγεία»).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateProodosDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  goalId!: string;

  @ApiProperty({ enum: ProodosStatus })
  @IsEnum(ProodosStatus)
  status!: ProodosStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Τίθεται αυτόματα σε «τώρα» όταν ο στόχος ολοκληρώνεται χωρίς ρητή ημερομηνία.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

// ─────────────────── Καρτέλα Οδηγών (entries) ───────────────────

export class ProodosEntryDto {
  @ApiProperty({ description: 'Τύπος στοιχείου — ερμηνεύεται ανά κλάδο (π.χ. MONOPATI, PROSANATOLISMOS).' })
  @IsString()
  @MaxLength(40)
  kind!: string;

  @ApiPropertyOptional({ description: 'Υποκατηγορία/ενότητα ανάλογα με τον τύπο.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiProperty({ description: 'Όνομα Μονοπατιού/Πτυχίου (ή «Υπόσχεση»).' })
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  passedAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  passedAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
