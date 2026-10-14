import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/** Γραμμή του ποσολογίου. */
export class MealIngredientDto {
  @ApiProperty({ description: 'Το υλικό — οι άδειες γραμμές πέφτουν.' })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ description: 'Συνολική ποσότητα ως κείμενο, π.χ. «2 kg».' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  qty?: string;

  @ApiPropertyOptional({ default: false, description: 'Αγοράστηκε.' })
  @IsOptional()
  @IsBoolean()
  bought?: boolean;
}

/** Μενού, συνταγή και ποσολόγιο ενός γεύματος — ό,τι δεν δίνεται μένει όπως είναι. */
export class UpdateMealDto {
  @ApiPropertyOptional({ nullable: true, description: 'Τι τρώμε — σύντομο κείμενο.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  menu?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Η συνταγή — Markdown.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  recipe?: string | null;

  @ApiPropertyOptional({ type: [MealIngredientDto], description: 'Το ποσολόγιο — αντικαθιστά ολόκληρη τη λίστα όταν δίνεται.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MealIngredientDto)
  ingredients?: MealIngredientDto[];
}
