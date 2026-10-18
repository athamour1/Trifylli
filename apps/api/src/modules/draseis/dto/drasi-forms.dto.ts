import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DrasiFormType, SignerRole } from '@trifylli/shared';

/** Έκδοση συνδέσμων: για όλους τους εκκρεμείς ή για συγκεκριμένους συμμετέχοντες/έντυπα. */
export class IssueFormsDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'ids συμμετεχόντων (participant)· κενό ⇒ όλοι.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsUUID(undefined, { each: true })
  participantIds?: string[];

  @ApiPropertyOptional({ enum: DrasiFormType, isArray: true, description: 'Κενό ⇒ όσα αναλογούν (υγείας σε όλους, συμμετοχής στους ανήλικους).' })
  @IsOptional()
  @IsArray()
  @IsEnum(DrasiFormType, { each: true })
  types?: DrasiFormType[];

  @ApiPropertyOptional({ description: 'true ⇒ και όσα έχουν ήδη σταλεί παίρνουν νέο σύνδεσμο (ο παλιός ακυρώνεται).' })
  @IsOptional()
  @IsBoolean()
  reissue?: boolean;
}

/** Ένας σύνδεσμος που μόλις εκδόθηκε: το έντυπο (ή η πρόσκληση) και το token του. */
export class EmailLinkDto {
  @ApiProperty({ format: 'uuid', description: 'Το έντυπο ή η πρόσκληση αξιολόγησης.' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Το token του συνδέσμου (το τελευταίο κομμάτι του URL) — ο server ελέγχει ότι είναι του εντύπου.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{30,60}$/)
  token!: string;
}

/**
 * Αποστολή με email συνδέσμων που μόλις εκδόθηκαν. Οι παραλήπτες βγαίνουν στον
 * server (όποιος υπογράφει) — ο client δεν ορίζει σε ποιον πάει.
 */
export class EmailLinksDto {
  @ApiProperty({ type: [EmailLinkDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => EmailLinkDto)
  links!: EmailLinkDto[];
}

/** Η υποβολή από τον γονέα — χωρίς συνεδρία, μόνο με το token του συνδέσμου. */
export class SubmitFormDto {
  @ApiProperty({ description: 'Απαντήσεις με κλειδί το `key` του πεδίου.' })
  @IsObject()
  answers!: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  signerName!: string;

  @ApiProperty({ enum: SignerRole })
  @IsEnum(SignerRole)
  signerRole!: SignerRole;

  @ApiProperty({ description: 'Ρητή συναίνεση — πρέπει να είναι `true`.' })
  @IsBoolean()
  @Equals(true, { message: 'Χρειάζεται η συναίνεσή σας για να υποβληθεί το έντυπο.' })
  consent!: boolean;

  @ApiPropertyOptional({ description: 'Η ζωγραφισμένη υπογραφή ως `data:image/png;base64,…` (προαιρετική).' })
  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  signatureDataUrl?: string;
}

export class SetPharmacyKitsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  kitIds!: string[];
}

export class ReadHealthDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  at?: Date;
}
