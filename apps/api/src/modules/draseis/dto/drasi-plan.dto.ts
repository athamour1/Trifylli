import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { KladosType, TreasuryCategory } from '@trifylli/shared';

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
