import { randomInt } from 'crypto';

/** Human-reportable agent id, e.g. A-48291 */
export function generateAgentPublicId(): string {
  return `A-${randomInt(10000, 100000)}`;
}
