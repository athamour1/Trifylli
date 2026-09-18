import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { KladosType, MemberKind } from '@trifylli/shared';

export class UpdateKladosDto {
  @ApiPropertyOptional({ description: 'Τοπική ονομασία (π.χ. «Πουλιά Τριφυλλιού»).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  minAge?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  maxAge?: number;
}

export class UpdateMembershipDto {
  @ApiProperty({ enum: KladosType })
  @IsEnum(KladosType)
  kladosType!: KladosType;

  @ApiPropertyOptional({ description: 'Εξάδα / ενωμοτία / πλήρωμα.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  subUnit?: string;

  @ApiPropertyOptional({ enum: MemberKind, description: 'Παιδί ή στέλεχος μέσα σε αυτόν τον κλάδο.' })
  @IsOptional()
  @IsEnum(MemberKind)
  kind?: MemberKind;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Κλείνει τη συμμετοχή αντί να τη διαγράψει — το ιστορικό παραμένει.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leftAt?: Date;
}
