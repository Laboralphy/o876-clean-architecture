import { DomainError } from '../../../domain/errors';

export function requireUser(currentUserId: string | null): string {
    if (currentUserId === null) {
        throw new DomainError('UNAUTHORIZED', 'Authentication required');
    }
    return currentUserId;
}
