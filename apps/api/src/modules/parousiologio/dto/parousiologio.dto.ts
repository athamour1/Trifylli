import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ParousiaStatus } from '@trifylli/shared';

export class ParousiaEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  memberId!: string;

  @ApiProperty({ enum: ParousiaStatus })
  @IsEnum(ParousiaStatus)
  status!: ParousiaStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Πότε πατήθηκε αυτή η σήμανση στη συσκευή — αλλιώς ισχύει το `recordedAt` της αποστολής.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recordedAt?: Date;
}

export class SubmitParousiologioDto {
  @ApiProperty({ type: [ParousiaEntryDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ParousiaEntryDto)
  entries!: ParousiaEntryDto[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Πότε συμπληρώθηκε στη συσκευή. Καθορίζει ποια εκδοχή κερδίζει μετά από offline συγχρονισμό.',
  })
  @Type(() => Date)
  @IsDate()
  recordedAt!: Date;
}
