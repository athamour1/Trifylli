import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Ο λογαριασμός e-SEO με τον οποίο συγχρονίζει το API. */
export class EseoLoginDto {
  @ApiProperty({ description: 'Το όνομα χρήστη στο eseo.seo.gr' })
  @IsString()
  @IsNotEmpty({ message: 'Γράψε το όνομα χρήστη.' })
  @MaxLength(200)
  username!: string;

  @ApiProperty({ description: 'Ο κωδικός — αποθηκεύεται κρυπτογραφημένος, δεν επιστρέφεται ποτέ.' })
  @IsString()
  @IsNotEmpty({ message: 'Γράψε τον κωδικό.' })
  @MaxLength(500)
  password!: string;
}
