import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DrasiType, KladosType, MemberKind } from '@trifylli/shared';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateDrasiDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: DrasiType })
  @IsEnum(DrasiType)
  type!: DrasiType;

  @ApiPropertyOptional({ enum: KladosType, description: 'Κενό ⇒ δράση Τοπικού με πολλούς κλάδους.' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dateStart!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dateEnd!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Κόστος συμμετοχής ανά άτομο σε ευρώ.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPerPerson?: number;
}

export class UpdateDrasiDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateStart?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateEnd?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPerPerson?: number;
}

export class QueryDraseisDto extends PaginationDto {
  @ApiPropertyOptional({ enum: DrasiType, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsEnum(DrasiType, { each: true })
  type?: DrasiType[];

  @ApiPropertyOptional({ enum: KladosType })
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'true ⇒ μόνο μελλοντικές δράσεις.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  upcoming?: boolean;
}

export class AddParticipantsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  memberIds!: string[];

  @ApiPropertyOptional({ enum: MemberKind, description: 'Τι μετράει στη δράση (π.χ. μεγάλο μέλος ως βοηθός).' })
  @IsOptional()
  @IsEnum(MemberKind)
  kind?: MemberKind;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirmed?: boolean;
}

export class UpdateParticipantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @ApiPropertyOptional({ description: 'Παρουσία στη δράση.' })
  @IsOptional()
  @IsBoolean()
  attended?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
