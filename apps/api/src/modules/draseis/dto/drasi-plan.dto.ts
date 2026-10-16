import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DrasiScheduleKind, DrasiSnack, KladosType, TreasuryCategory } from '@trifylli/shared';

// ───────────────────────── Ωρολόγιο & προγραμματικό (F7) ─────────────────────────

/** Γραμμή της λίστας υλικού ενός στοιχείου, όπως στις συγκεντρώσεις. */
export class ScheduleYlikoItemDto {
  @ApiProperty({ description: 'Ελεύθερο κείμενο — δεν δείχνει στην αποθήκη. Οι άδειες γραμμές πέφτουν.' })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional({ default: false, description: 'Μπήκε στο σακίδιο.' })
  @IsOptional()
  @IsBoolean()
  packed?: boolean;
}

/** Το πλαίσιο (ωρολόγιο) ΚΑΙ το προγραμματικό — τα προγραμματικά πεδία είναι προαιρετικά. */
export class CreateScheduleItemDto {
  @ApiProperty({ description: 'Η ημέρα, YYYY-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440, default: 30, description: 'Διάρκεια σε λεπτά — η ώρα προκύπτει από αυτήν.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMin?: number;

  @ApiProperty()
  @IsString()
  @Matches(/\S/, { message: 'Το στοιχείο του ωρολογίου θέλει τίτλο.' })
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ enum: DrasiScheduleKind })
  @IsOptional()
  @IsEnum(DrasiScheduleKind)
  kind?: DrasiScheduleKind;

  @ApiPropertyOptional({ enum: DrasiSnack, nullable: true, description: 'Κολατσιό μέσα σε αυτό το στοιχείο — μπαίνει στο διατροφολόγιο.' })
  @IsOptional()
  @IsEnum(DrasiSnack)
  snack?: DrasiSnack | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ description: 'Το προγραμματικό — Markdown.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Οι υπεύθυνοι (στελέχη της δράσης) — αντικαθιστά τη λίστα όταν δίνεται.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  responsibleIds?: string[] | null;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Νέοι υπεύθυνοι — χωρίς να σταλεί όλη η λίστα (δύο που αλλάζουν μαζί δεν σβήνουν ο ένας τον άλλον).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  addResponsibleIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Υπεύθυνοι που βγαίνουν.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  removeResponsibleIds?: string[];

  @ApiPropertyOptional({ type: [ScheduleYlikoItemDto], description: 'Η λίστα υλικού — αντικαθιστά ολόκληρη τη λίστα όταν δίνεται.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScheduleYlikoItemDto)
  yliko?: ScheduleYlikoItemDto[];
}

export class UpdateScheduleItemDto extends CreateScheduleItemDto {
  @ApiPropertyOptional({ description: 'Μεταφορά σε άλλη ημέρα (YYYY-MM-DD).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  declare date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Το στοιχείο του ωρολογίου θέλει τίτλο.' })
  @MaxLength(200)
  declare title: string;
}

/** Η σειρά των στοιχείων μιας ημέρας — από αυτήν προκύπτουν οι ώρες. */
export class ReorderScheduleDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Τα ids της ημέρας με τη νέα σειρά.' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

/** Μετακίνηση ενός στοιχείου μέσα στην ημέρα του: μετά από άλλο, ή πρώτο. */
export class MoveScheduleItemDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Το στοιχείο μετά από το οποίο μπαίνει· `null` = πρώτο της ημέρας.' })
  @IsOptional()
  @IsUUID()
  afterId?: string | null;
}

/** Ώρα έναρξης μιας ημέρας — η πρώτη ημέρα ακολουθεί πάντα το `dateStart` της δράσης. */
export class DayStartDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional({ description: '«HH:mm»· κενό ⇒ επαναφορά στην ώρα της δράσης.', nullable: true })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  time?: string | null;
}

/** «Το παίρνω εγώ» (`true`) ή «δεν το παίρνω» (`false`). */
export class ClaimShoppingDto {
  @ApiProperty()
  @IsBoolean()
  claim!: boolean;
}

/** «Μπήκε» στη φόρτωση (`true`) ή όχι ακόμα. */
export class LoadedDto {
  @ApiProperty()
  @IsBoolean()
  loaded!: boolean;
}

/** «Καθυστερούμε N΄ από εδώ και πέρα» — αρνητικά λεπτά = κερδίσαμε χρόνο. */
export class AddDelayDto {
  @ApiProperty({ description: 'Από αυτό το στοιχείο του ωρολογίου (και όσα ακολουθούν την ίδια ημέρα)' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ minimum: -240, maximum: 240 })
  @IsInt()
  @Min(-240)
  @Max(240)
  minutes!: number;
}

/** Αντιγραφή ολόκληρης ημέρας σε άλλη — η κατασκήνωση έχει ίδιο σκελετό κάθε μέρα. */
export class CopyDayDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

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
