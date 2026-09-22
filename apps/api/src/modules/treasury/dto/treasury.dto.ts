import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DonorType, KladosType, TreasuryCategory, TreasuryEntryKind } from '@trifylli/shared';

export class CreateTreasuryEntryDto {
  @IsEnum(TreasuryEntryKind)
  kind!: TreasuryEntryKind;

  @IsString()
  @IsIn(Object.values(TreasuryCategory))
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Κενό ⇒ κίνηση ταμείου Τοπικού (μόνο υπερδιαχειριστής). */
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  @IsOptional()
  @IsEnum(DonorType)
  donorType?: DonorType;

  @IsOptional()
  @IsUUID()
  receiptFileId?: string;
}

export class QueryTreasuryDto {
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;

  @IsOptional()
  @IsEnum(TreasuryEntryKind)
  kind?: TreasuryEntryKind;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
