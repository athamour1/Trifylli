import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { DrasiRoleKind, YpiresiesRotation } from '@trifylli/shared';

export class SetYpiresiesSettingsDto {
  @ApiProperty({ enum: YpiresiesRotation })
  @IsEnum(YpiresiesRotation)
  rotation!: YpiresiesRotation;
}

/** Ενεργοποίηση προκαθορισμένης (`kind`) ή νέα πρόσθετη υπηρεσία (`name`). */
export class CreateYpiresiaDto {
  @ApiPropertyOptional({ enum: DrasiRoleKind })
  @IsOptional()
  @IsEnum(DrasiRoleKind)
  kind?: DrasiRoleKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
}

export class UpdateYpiresiaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
}

export class SetResponsiblesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}

export class YpiresiaSlotDto {
  @ApiProperty({ example: '2027-07-05' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ enum: [0, 1] })
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  half!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  groupId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: '`null` ⇒ η ομάδα είναι ελεύθερη σε αυτή τη βάρδια.' })
  @IsOptional()
  @IsUUID()
  ypiresiaId?: string | null;
}

/** Αλλαγές στο χρονοδιάγραμμα — μόνο τα κελιά που άλλαξαν. */
export class SetYpiresiaSlotsDto {
  @ApiProperty({ type: [YpiresiaSlotDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => YpiresiaSlotDto)
  slots!: YpiresiaSlotDto[];
}
