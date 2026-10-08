import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AccountRole, KladosType } from '@trifylli/shared';

export class CreateAccountDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({
    description:
      'Το email με το οποίο θα συνδεθεί μέσω Authentik. Αν το άτομο υπάρχει ήδη στο μητρώο ' +
      'με αυτό το email, προάγεται σε λογαριασμό αντί να δημιουργηθεί διπλότυπο.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: [AccountRole.SUPER_ADMIN, AccountRole.KLADOS_ADMIN] })
  @IsIn([AccountRole.SUPER_ADMIN, AccountRole.KLADOS_ADMIN], { message: 'Τα στελέχη ενεργοποιούνται από τη λίστα στελεχών.' })
  role!: AccountRole;

  @ApiPropertyOptional({
    enum: KladosType,
    description: 'Υποχρεωτικό για `KLADOS_ADMIN`, απαγορεύεται για `SUPER_ADMIN`.',
  })
  @IsOptional()
  @IsEnum(KladosType)
  adminKlados?: KladosType;
}

export class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: [AccountRole.SUPER_ADMIN, AccountRole.KLADOS_ADMIN] })
  @IsOptional()
  @IsIn([AccountRole.SUPER_ADMIN, AccountRole.KLADOS_ADMIN], { message: 'Τα στελέχη ενεργοποιούνται από τη λίστα στελεχών.' })
  role?: AccountRole;

  @ApiPropertyOptional({ enum: KladosType })
  @IsOptional()
  @IsEnum(KladosType)
  adminKlados?: KladosType;
}

/** Μαζική ενεργοποίηση στελεχών: λογαριασμός + email ορισμού κωδικού. */
export class ActivateStelexiDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}
