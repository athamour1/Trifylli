-- Ο υπεύθυνος φιλοξενούμενου Τοπικού ως άτομο: φιλοξενούμενο στέλεχος της δράσης.
ALTER TABLE "drasi_guest_topiko" ADD COLUMN "contactUserId" UUID;
ALTER TABLE "drasi_guest_topiko" ADD CONSTRAINT "drasi_guest_topiko_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
