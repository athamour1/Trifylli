import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DrasiFeeKind,
  DrasiLedgerKind,
  PaymentHandlingStatus,
  TreasuryCategory,
  TreasuryEntryKind,
} from '@trifylli/shared';

// ───────────────────────── Ταμείο δράσης (F1) ─────────────────────────

export class CreateDrasiTreasuryEntryDto {
  @ApiProperty({ enum: TreasuryEntryKind })
  @IsEnum(TreasuryEntryKind)
  kind!: TreasuryEntryKind;

  @ApiProperty({ description: 'Κατηγορία δράσης (DRASI_INCOME_CATEGORIES / DRASI_EXPENSE_CATEGORIES).' })
  @IsString()
  @IsIn(Object.values(TreasuryCategory))
  category!: string;

  @ApiProperty({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;

  @ApiPropertyOptional({ description: 'Αιτιολογία — μία απόδειξη, μία γραμμή.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string;
}

export class BudgetLineDto {
  @ApiProperty()
  @IsString()
  @IsIn(Object.values(TreasuryCategory))
  category!: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  planned!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, description: 'Στόχος ποσοστού επί του συνόλου (0–1).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  targetPct?: number;
}

/** Αντικαθιστά τον προϋπολογισμό (όλες οι κατηγορίες μαζί). */
export class SetBudgetDto {
  @ApiProperty({ type: [BudgetLineDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  items!: BudgetLineDto[];
}

// ───────────────────────── Κόστη & εισπράξεις (F4) ─────────────────────────

export class UpdateParticipantFeesDto {
  @ApiPropertyOptional({ enum: DrasiFeeKind })
  @IsOptional()
  @IsEnum(DrasiFeeKind)
  feeKind?: DrasiFeeKind;

  @ApiPropertyOptional({ minimum: 0, description: 'Κενό ⇒ από τις προεπιλογές της δράσης.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeAmount?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transportAmount?: number | null;

  @ApiPropertyOptional({ description: 'Γιατί μειωμένη / δωρεάν.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  feeNote?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Το στέλεχος που εισπράττει από αυτό το άτομο.' })
  @IsOptional()
  @IsUUID()
  collectorId?: string | null;
}

export class CreateDrasiPaymentDto {
  @ApiProperty({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;

  @ApiPropertyOptional({ description: '`CASH` (προεπιλογή) ή `BANK`.' })
  @IsOptional()
  @IsIn(['CASH', 'BANK'])
  method?: 'CASH' | 'BANK';

  @ApiPropertyOptional({ format: 'uuid', description: 'Ποιο στέλεχος εισέπραξε· κενό ⇒ ο υπεύθυνος είσπραξης ή εσύ.' })
  @IsOptional()
  @IsUUID()
  collectedById?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class UpdateDrasiPaymentHandlingDto {
  @ApiProperty({ enum: PaymentHandlingStatus })
  @IsEnum(PaymentHandlingStatus)
  handlingStatus!: PaymentHandlingStatus;
}

/** Μαζική παράδοση: όλα τα μετρητά που κρατά ένα στέλεχος περνούν στο επόμενο στάδιο. */
export class HandoverDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  collectorId!: string;
}

// ───────────────────────── Λογαριασμοί στελεχών (F2) ─────────────────────────

export class CreateLedgerEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: DrasiLedgerKind })
  @IsEnum(DrasiLedgerKind)
  kind!: DrasiLedgerKind;

  @ApiProperty({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SettleLedgerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}
