import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { KladosType, TimelineSection } from '@trifylli/shared';

export class CreateSyggentrwshDto {
  @ApiProperty({ enum: KladosType })
  @IsEnum(KladosType)
  kladosType!: KladosType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Όταν ανήκει σε δράση/κατασκήνωση.' })
  @IsOptional()
  @IsUUID()
  drasiId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startTime?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endTime?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Η κεντρική ιδέα της συγκέντρωσης.' })
  @IsOptional()
  @IsString()
  goal?: string;
}

export class UpdateSyggentrwshDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startTime?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endTime?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ description: 'Απολογισμός μετά τη συγκέντρωση.' })
  @IsOptional()
  @IsString()
  review?: string;
}

export class TimelineBlockDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Κενό ⇒ νέο κομμάτι.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ enum: TimelineSection })
  @IsEnum(TimelineSection)
  section!: TimelineSection;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMin!: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Υπεύθυνος διεξαγωγής.' })
  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Υπεύθυνος υλοποίησης (προετοιμασία).' })
  @IsOptional()
  @IsUUID()
  executorId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Απαιτούμενο υλικό.' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  ylikoIds?: string[];
}

export class PlanSectionDto {
  @ApiProperty({ enum: TimelineSection })
  @IsEnum(TimelineSection)
  section!: TimelineSection;

  @ApiProperty({ description: 'Markdown· κενό σημαίνει «καμία σημείωση».' })
  @IsString()
  @MaxLength(20_000)
  notes!: string;

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description: 'Διάρκεια του μέρους· αγνοείται όταν το μέρος έχει κομμάτια.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMin?: number;
}

export class PlanYlikoItemDto {
  @ApiProperty({ description: 'Ελεύθερο κείμενο — δεν δείχνει στην αποθήκη.' })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  packed?: boolean;
}

/**
 * Ο σχεδιασμός αποθηκεύεται ολόκληρος με κάθε αποθήκευση (replace), όχι με
 * μεμονωμένα PATCH. Δύο λόγοι:
 *
 *  * ο σχεδιασμός συγκέντρωσης είναι αναδιάταξη κομματιών — η σειρά προκύπτει
 *    από τη θέση στον πίνακα, οπότε δεν υπάρχει ενδιάμεση κατάσταση με διπλά
 *    `order` που θα έσπαγε το unique constraint·
 *  * η οθόνη σχεδιασμού αποθηκεύει μόνη της καθώς γράφεις, και ένα αίτημα ανά
 *    αποθήκευση περνά αυτούσιο από την offline ουρά.
 */
export class ReplacePlanDto {
  @ApiProperty({ type: [TimelineBlockDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimelineBlockDto)
  blocks!: TimelineBlockDto[];

  @ApiPropertyOptional({ type: [PlanSectionDto], description: 'Κείμενο και διάρκεια ανά μέρος.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanSectionDto)
  sections?: PlanSectionDto[];

  @ApiPropertyOptional({ type: [PlanYlikoItemDto], description: 'Λίστα «τι να πάρουμε μαζί».' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanYlikoItemDto)
  yliko?: PlanYlikoItemDto[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Τα στελέχη που αναλαμβάνουν τη συγκέντρωση.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  stelexosIds?: string[];
}
