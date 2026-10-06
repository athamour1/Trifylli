import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DrasiRoleKind, DrasiStatus, DrasiType, KladosType, MemberKind } from '@trifylli/shared';
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

  @ApiPropertyOptional({
    description:
      'true ⇒ η δράση γεννιέται ως ΠΡΟΣΧΕΔΙΟ (το wizard δεν τελείωσε): δεν μετράει σε ημερολόγιο ' +
      'και στατιστικά μέχρι να ενεργοποιηθεί.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  draft?: boolean;
}

export class UpdateDrasiDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: DrasiType })
  @IsOptional()
  @IsEnum(DrasiType)
  type?: DrasiType;

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

  @ApiPropertyOptional({
    enum: DrasiStatus,
    description: 'ENERGI = ολοκλήρωση wizard· KLEISTI = κλείσιμο (τα οικονομικά κλειδώνουν).',
  })
  @IsOptional()
  @IsEnum(DrasiStatus)
  status?: DrasiStatus;
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

// ───────────────────────── Wizard: ποιοι έρχονται ─────────────────────────

/** Αντικαθιστά το σύνολο των δικών μας κλάδων που συμμετέχουν. */
export class SetDrasiKladoiDto {
  @ApiProperty({ enum: KladosType, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(KladosType, { each: true })
  kladoi!: KladosType[];
}

export class GuestTopikoDto {
  @ApiProperty({ description: 'Ο κωδικός (unitId) του Τοπικού στο e-SEO.' })
  @IsString()
  @Matches(/^\d{1,10}$/, { message: 'Ο κωδικός Τοπικού είναι αριθμός (unitId του e-SEO).' })
  topikoCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  topikoName!: string;

  @ApiProperty({ enum: KladosType, isArray: true, description: 'Ποιοι κλάδοι τους έρχονται.' })
  @IsArray()
  @ArrayUnique()
  @IsEnum(KladosType, { each: true })
  kladoi!: KladosType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;
}

/** Αντικαθιστά το σύνολο των φιλοξενούμενων Τοπικών. */
export class SetGuestTopikaDto {
  @ApiProperty({ type: [GuestTopikoDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GuestTopikoDto)
  items!: GuestTopikoDto[];
}

// ───────────────────────── Wizard: αρχηγείο & υπηρεσίες ─────────────────────────

export class DrasiRoleDto {
  @ApiProperty({ enum: DrasiRoleKind })
  @IsEnum(DrasiRoleKind)
  kind!: DrasiRoleKind;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * Αντικαθιστά ΟΛΕΣ τις ευθύνες της δράσης (αρχηγείο + υπηρεσίες). Υπηρεσία που
 * δεν ισχύει = δεν στέλνεται καμία γραμμή της.
 */
export class SetDrasiRolesDto {
  @ApiProperty({ type: [DrasiRoleDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DrasiRoleDto)
  roles!: DrasiRoleDto[];
}

export class RolesTemplateQueryDto {
  @ApiPropertyOptional({ enum: KladosType, description: 'Κενό ⇒ η τελευταία δράση Τοπικού.' })
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Η δράση που στήνεται τώρα — εξαιρείται.' })
  @IsOptional()
  @IsUUID()
  exclude?: string;
}
