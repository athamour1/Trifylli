import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DrasiScheduleKind, KladosType, TreasuryCategory } from '@trifylli/shared';

// ───────────────────────── Ωρολόγιο & προγραμματικό (F7) ─────────────────────────

export class ScheduleYlikoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ylikoId!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;
}

/** Το πλαίσιο (ωρολόγιο) ΚΑΙ το προγραμματικό — τα προγραμματικά πεδία είναι προαιρετικά. */
export class CreateScheduleItemDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;

  @ApiProperty()
  @IsString()
  @Matches(/\S/, { message: 'Το στοιχείο του ωρολογίου θέλει τίτλο.' })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ enum: DrasiScheduleKind })
  @IsOptional()
  @IsEnum(DrasiScheduleKind)
  kind?: DrasiScheduleKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ description: 'Το προγραμματικό — Markdown.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Υπεύθυνος διεξαγωγής.' })
  @IsOptional()
  @IsUUID()
  responsibleId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Υπεύθυνος υλοποίησης.' })
  @IsOptional()
  @IsUUID()
  executorId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ylikoNotes?: string | null;

  @ApiPropertyOptional({ type: [ScheduleYlikoDto], description: 'Αντικαθιστά το υλικό του στοιχείου όταν δίνεται.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ScheduleYlikoDto)
  yliko?: ScheduleYlikoDto[];
}

export class UpdateScheduleItemDto extends CreateScheduleItemDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  declare startsAt: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Το στοιχείο του ωρολογίου θέλει τίτλο.' })
  @MaxLength(200)
  declare title: string;
}

/** Αντιγραφή ολόκληρης ημέρας σε άλλη — η κατασκήνωση έχει ίδιο σκελετό κάθε μέρα. */
export class CopyDayDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class CreateDrasiSymvoulioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Κενό ⇒ σήμερα.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}

export class ShoppingItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  qty?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedCost?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Ποιος το αγοράζει.' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

/** «Αγοράστηκε»: γίνεται κίνηση εξόδου στο ταμείο της δράσης και δένεται με το είδος. */
export class PurchaseShoppingItemDto {
  @ApiProperty({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Κατηγορία εξόδου· προεπιλογή ΠΡΟΓΡΑΜΜΑ.' })
  @IsOptional()
  @IsString()
  @IsEnum(TreasuryCategory)
  category?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string;

  @ApiPropertyOptional({ description: 'true ⇒ μετά τη δράση μπαίνει στην αποθήκη του διοργανωτή ως είδος.' })
  @IsOptional()
  @Type(() => Boolean)
  keepAsYliko?: boolean;
}

export class ExternalYlikoDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  qty?: number;

  @ApiPropertyOptional({ enum: KladosType, description: 'Δικός μας κλάδος που το φέρνει.' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Φιλοξενούμενο Τοπικό που το φέρνει.' })
  @IsOptional()
  @IsUUID()
  guestTopikoId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  responsibleId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}
