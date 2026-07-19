type PrismaKnownErrorShape = {
  code?: unknown;
  meta?: {
    target?: unknown;
  };
};

export function isPrismaUniqueConstraintError(
  error: unknown,
): error is PrismaKnownErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as PrismaKnownErrorShape).code === 'P2002'
  );
}

export function getPrismaUniqueConstraintTargets(error: unknown): string[] {
  if (!isPrismaUniqueConstraintError(error)) {
    return [];
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.filter((value): value is string => typeof value === 'string');
  }

  if (typeof target === 'string') {
    return [target];
  }

  return [];
}
