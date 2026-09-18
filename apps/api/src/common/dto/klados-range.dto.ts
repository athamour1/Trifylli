import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { KladosType } from '@trifylli/shared';
import { DateRangeDto, RequiredDateRangeDto } from './date-range.dto';

/**
 * Το `klados` ζει μέσα στο DTO και όχι ως ξεχωριστό `@Query('klados')`.
 *
 * Ο global `ValidationPipe` τρέχει με `forbidNonWhitelisted`, οπότε επικυρώνει
 * ολόκληρο το query string απέναντι στο DTO: ένα πεδίο που δηλώνεται μόνο ως
 * χωριστή παράμετρος θεωρείται άγνωστο και το αίτημα κόβεται με 400.
 */
export class KladosDateRangeDto extends DateRangeDto {
  @ApiPropertyOptional({ enum: KladosType, description: 'Κενό ⇒ όλοι οι κλάδοι της εμβέλειάς σας.' })
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;
}

export class KladosRequiredRangeDto extends RequiredDateRangeDto {
  @ApiPropertyOptional({ enum: KladosType })
  @IsOptional()
  @IsEnum(KladosType)
  klados?: KladosType;
}
