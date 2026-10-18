import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Ο κωδικός του Τοπικού στο e-SEO — το κλειδί με το οποίο ο συγχρονισμός βρίσκει τα μέλη του. */
export class SetEseoCodeDto {
  @ApiProperty({ nullable: true, description: 'π.χ. `35` — κενό ⇒ χωρίς κωδικό (ο συγχρονισμός σταματά).' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\s*[A-Za-z0-9-]*\s*$/, { message: 'Ο κωδικός e-SEO έχει μόνο ψηφία, λατινικά γράμματα και παύλες.' })
  code!: string | null;
}
