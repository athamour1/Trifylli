import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IDIOTITA_VALUES, KladosType, MemberKind, MemberStatus, SyndromiStatus } from '@trifylli/shared';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** Δέχεται `?role=A&role=B` και `?role=A,B` — το UI στέλνει το δεύτερο. */
const csv = () =>
  Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
    return value;
  });

export class QueryMeloiDto extends PaginationDto {
  @ApiPropertyOptional({ enum: KladosType, isArray: true })
  @IsOptional()
  @csv()
  @IsArray()
  @IsEnum(KladosType, { each: true })
  kladosType?: KladosType[];

  @ApiPropertyOptional({ enum: MemberKind, isArray: true, description: 'Παιδιά ή στελέχη.' })
  @IsOptional()
  @csv()
  @IsArray()
  @IsEnum(MemberKind, { each: true })
  kind?: MemberKind[];

  @ApiPropertyOptional({ isArray: true, description: 'Ιδιότητες (από e-SEO): ASTERI, STELEXOS, TOPIKO_SYMVOULIO, …' })
  @IsOptional()
  @csv()
  @IsArray()
  @IsIn(IDIOTITA_VALUES as readonly string[], { each: true })
  idiotita?: string[];

  @ApiPropertyOptional({ enum: MemberStatus, isArray: true, default: [MemberStatus.ENERGO] })
  @IsOptional()
  @csv()
  @IsArray()
  @IsEnum(MemberStatus, { each: true })
  status?: MemberStatus[];

  @ApiPropertyOptional({ minimum: 0, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  ageMin?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  ageMax?: number;

  @ApiPropertyOptional({ description: 'Μόνο μέλη με ανοιχτό υπόλοιπο στην τρέχουσα περίοδο.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasDebt?: boolean;

  @ApiPropertyOptional({ description: 'Μόνο στελέχη με ενεργό πτυχίο «Στέλεχος SOS».' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sos?: boolean;

  @ApiPropertyOptional({ enum: SyndromiStatus, isArray: true })
  @IsOptional()
  @csv()
  @IsArray()
  @IsEnum(SyndromiStatus, { each: true })
  syndromiStatus?: SyndromiStatus[];

  @ApiPropertyOptional({ description: 'Αναζήτηση σε όνομα, επώνυμο, email.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Υποομάδα (εξάδα/ενωμοτία).' })
  @IsOptional()
  @IsString()
  subUnit?: string;
}
