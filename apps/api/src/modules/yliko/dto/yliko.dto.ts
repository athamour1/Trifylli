import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { KladosType, MaintenanceKind, ReturnCondition, YlikoCategory } from '@trifylli/shared';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateYlikoDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: YlikoCategory })
  @IsEnum(YlikoCategory)
  category!: YlikoCategory;

  @ApiPropertyOptional({ enum: KladosType, description: 'Κενό ⇒ υλικό κεντρικής αποθήκης.' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalQty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageLocation?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Σημείο αποθήκευσης από τη ρυθμιζόμενη λίστα.' })
  @IsOptional()
  @IsUUID()
  storagePointId?: string;

  @ApiPropertyOptional({ description: 'Αναλώσιμο: η παραλαβή μειώνει μόνιμα το απόθεμα.' })
  @IsOptional()
  @IsBoolean()
  consumable?: boolean;

  @ApiPropertyOptional({ minimum: 0, description: 'Κατώφλι ειδοποίησης επαναπαραγγελίας.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQty?: number;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateYlikoDto extends CreateYlikoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare name: string;

  @ApiPropertyOptional({ enum: YlikoCategory })
  @IsOptional()
  @IsEnum(YlikoCategory)
  declare category: YlikoCategory;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declare totalQty: number;
}

export class QueryYlikoDto extends PaginationDto {
  @ApiPropertyOptional({ enum: YlikoCategory, isArray: true })
  @IsOptional()
  @Type(() => String)
  @IsEnum(YlikoCategory, { each: true })
  category?: YlikoCategory[];

  @ApiPropertyOptional({ enum: KladosType })
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;

  @ApiPropertyOptional({ description: 'true ⇒ μόνο υλικό κεντρικής αποθήκης (χωρίς κλάδο).' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  centralOnly?: boolean;

  @ApiPropertyOptional({ description: 'Αναζήτηση στο όνομα.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Μαζί με το `to`: υπολογίζει διαθεσιμότητα για το διάστημα.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Μόνο είδη κάτω από το `minQty` ή ληγμένα.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  lowStock?: boolean;
}

export class CreateCheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ylikoId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  drasiId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  syggentrwshId?: string;

  @ApiPropertyOptional({ enum: KladosType, description: 'Ποιος κλάδος δεσμεύει.' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReturnCheckoutDto {
  @ApiPropertyOptional({ minimum: 0, description: 'Κενό ⇒ επιστράφηκαν όλα.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  returnedQty?: number;

  @ApiPropertyOptional({ enum: ReturnCondition, description: 'Σύντομη απογραφή κατάστασης.' })
  @IsOptional()
  @IsEnum(ReturnCondition)
  condition?: ReturnCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMaintenanceDto {
  @ApiProperty({ enum: MaintenanceKind })
  @IsEnum(MaintenanceKind)
  kind!: MaintenanceKind;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  note!: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Κόστος σε ευρώ, αν υπάρχει.' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}

// ───────────────────────── Σημεία αποθήκευσης ─────────────────────────

export class CreateStoragePointDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: KladosType, description: 'Κενό ⇒ σημείο κεντρικής αποθήκης.' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;
}

export class UpdateStoragePointDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class QueryStoragePointDto {
  @ApiPropertyOptional({ enum: KladosType, description: 'Σημεία αυτού του κλάδου (+ κεντρικά).' })
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;
}
