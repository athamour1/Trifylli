import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { KladosType } from '@trifylli/shared';

export class QueryPharmacyDto {
  /** Κενό ⇒ φαρμακεία Τοπικού. */
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;
}

export class LinkPharmacyDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  /** Ταυτότητα του Kit στο OuchTracker. */
  @IsString()
  @MaxLength(80)
  ouchtrackerKitId!: string;

  /** Κενό ⇒ φαρμακείο Τοπικού (μόνο υπερδιαχειριστής). */
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;
}

export class LendPharmacyDto {
  /** Σε ποιον δανείζεται. Κενό ⇒ στο Τοπικό (για δράσεις Τοπικού). */
  @IsOptional()
  @IsEnum(KladosType)
  toKladosType?: KladosType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
