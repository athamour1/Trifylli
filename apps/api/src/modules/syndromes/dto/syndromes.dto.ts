import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
import { DonorType, PaymentHandlingStatus, PaymentMethod } from '@trifylli/shared';

export class CreatePeriodDto {
  @ApiProperty({ example: '2026–2027' })
  @IsString()
  @MaxLength(40)
  label!: string;

  @ApiProperty({ type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiProperty({ minimum: 0, description: 'Ετήσιο ποσό συνδρομής σε ευρώ.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  syndromiAmount!: number;

  @ApiPropertyOptional({ description: 'Ορίζει την περίοδο ως τρέχουσα (οι άλλες απενεργοποιούνται).' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: 'Δημιουργεί συνδρομές για όλα τα ενεργά μέλη.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  generateForAllMembers?: boolean;
}

export class SetSyndromiDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Κενό ⇒ τρέχουσα περίοδος.' })
  @IsOptional()
  @IsUUID()
  periodId?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Κενό ⇒ το ποσό της περιόδου.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountDue?: number;

  @ApiPropertyOptional({ description: 'Απαλλαγή — δεν μετράει στις οφειλές.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  exempt?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePaymentDto {
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

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentHandlingStatus,
    description: 'Στάδιο μετρητών — προεπιλογή EISPRAXTHIKE όταν η πληρωμή είναι μετρητά.',
  })
  @IsOptional()
  @IsEnum(PaymentHandlingStatus)
  handlingStatus?: PaymentHandlingStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ποιο στέλεχος εισέπραξε τα μετρητά.' })
  @IsOptional()
  @IsUUID()
  collectedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  receiptNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  // ── Προαιρετική δωρεά μαζί με την είσπραξη (μπαίνει στο ταμείο του κλάδου) ──
  @ApiPropertyOptional({ minimum: 0.01, description: 'Ποσό δωρεάς, αν υπάρχει.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  donationAmount?: number;

  @ApiPropertyOptional({ enum: DonorType })
  @IsOptional()
  @IsEnum(DonorType)
  donorType?: DonorType;

  @ApiPropertyOptional({ description: 'Σημείωση δωρεάς (τι και πώς).' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  donationNote?: string;
}

/** Μετάβαση σταδίου διαχείρισης μετρητών. */
export class UpdateHandlingDto {
  @ApiProperty({ enum: PaymentHandlingStatus })
  @IsEnum(PaymentHandlingStatus)
  handlingStatus!: PaymentHandlingStatus;
}
