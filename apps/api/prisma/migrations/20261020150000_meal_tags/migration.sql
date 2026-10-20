-- Ετικέτες γευμάτων: πρωινό, μεσημεριανό, βραδινό δίπλα στο δεκατιανό και το απογευματινό.
ALTER TYPE "DrasiSnack" ADD VALUE 'PROINO' BEFORE 'DEKATIANO';
ALTER TYPE "DrasiSnack" ADD VALUE 'MESIMERIANO' BEFORE 'APOGEVMATINO';
ALTER TYPE "DrasiSnack" ADD VALUE 'VRADINO';
