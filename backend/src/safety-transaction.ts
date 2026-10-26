import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from './database';
// Follow creation and blocking read/write each other's tables. Serializable
// transactions prevent a concurrent follow from surviving a successful block.
export async function safetyTransaction<T>(
  db: Database,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
        throw error;
    }
  }
  throw new ConflictException('Another account change is finishing. Please try again.');
}
