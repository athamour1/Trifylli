import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Κάτι που πρέπει να αγοραστεί μια ημέρα — ό,τι δεν είναι στο ποσολόγιο ενός γεύματος. */
export class CreateFoodPurchaseDto {
  @ApiProperty({ description: 'Η ημέρα της δράσης (YYYY-MM-DD).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ description: 'Τι — π.χ. «Γάλα».' })
  @IsString()
  @Matches(/\S/, { message: 'Γράψε τι πρέπει να αγοραστεί.' })
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({ description: 'Πόσο — ελεύθερο κείμενο, π.χ. «6 λίτρα».' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  qty?: string;

  @ApiPropertyOptional({ description: 'Σημείωση για όποιον αγοράζει.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class UpdateFoodPurchaseDto {
  @ApiPropertyOptional({ description: 'Μεταφορά σε άλλη ημέρα (YYYY-MM-DD).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Γράψε τι πρέπει να αγοραστεί.' })
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  qty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

/** «Αγοράστηκε» ή όχι. */
export class SetBoughtDto {
  @ApiProperty()
  @IsBoolean()
  bought!: boolean;
}
