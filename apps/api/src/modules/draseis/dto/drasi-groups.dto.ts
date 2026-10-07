import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DrasiGroupKind, KladosType, MemberKind } from '@trifylli/shared';

// ───────────────────────── Φιλοξενούμενοι (F3) ─────────────────────────

/** Μέλος άλλου Τοπικού — γράφεται με το χέρι, γιατί το e-SEO δεν μας δίνει τα μέλη τους. */
export class CreateGuestDto {
  @ApiProperty({ description: 'Κωδικός e-SEO του Τοπικού προέλευσης.' })
  @IsString()
  @Matches(/^\d{1,10}$/, { message: 'Ο κωδικός Τοπικού είναι αριθμός.' })
  topikoCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  topikoName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional({ enum: MemberKind, default: MemberKind.MELOS })
  @IsOptional()
  @IsEnum(MemberKind)
  kind?: MemberKind;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  guardianPhone?: string;
}

export class QueryGuestsDto {
  @ApiPropertyOptional({ description: 'Αναζήτηση σε όνομα/επώνυμο/Τοπικό.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

// ───────────────────────── Ομάδες (F14) ─────────────────────────

export class CreateGroupDto {
  @ApiProperty({ enum: DrasiGroupKind })
  @IsEnum(DrasiGroupKind)
  kind!: DrasiGroupKind;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ enum: KladosType, description: 'Ο κλάδος της κατάταξης· κενό για σκηνές.' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Ομαδάρχης — id συμμετέχοντα (participant).' })
  @IsOptional()
  @IsUUID()
  leaderParticipantId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

/** Αντικαθιστά τα μέλη μιας ομάδας· όποιος ήταν σε άλλη ομάδα του ίδιου είδους μεταφέρεται. */
export class SetGroupMembersDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'ids συμμετεχόντων (participant).' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  participantIds!: string[];
}

export class AutoGroupsDto {
  @ApiProperty({ enum: DrasiGroupKind })
  @IsEnum(DrasiGroupKind)
  kind!: DrasiGroupKind;

  @ApiPropertyOptional({ enum: KladosType, description: 'Ποιου κλάδου τα παιδιά μοιράζονται· κενό ⇒ όλοι (σκηνές).' })
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  @ApiPropertyOptional({ minimum: 1, maximum: 40, description: 'Πόσες ομάδες να φτιαχτούν αν δεν υπάρχουν.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  count?: number;
}
