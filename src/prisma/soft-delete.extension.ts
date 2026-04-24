import { Prisma } from '@prisma/client';

const SOFT_DELETE_MODELS = ['Tenant', 'User', 'Channel', 'AiContext'] as const;
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

function isSoftDeleteModel(model?: string): model is SoftDeleteModel {
  return !!model && (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}

function lowercaseFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function mergeDeletedAtFilter<T extends { where?: Record<string, unknown> }>(
  args: T,
): T {
  const existing = args.where ?? {};
  if ('deletedAt' in existing) return args;
  return { ...args, where: { ...existing, deletedAt: null } };
}

export const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'softDelete',
    query: {
      $allModels: {
        async findUnique({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          const result = (await query(args)) as { deletedAt?: Date | null } | null;
          if (result && result.deletedAt) return null;
          return result;
        },
        async findUniqueOrThrow({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          const result = (await query(args)) as { deletedAt?: Date | null };
          if (result.deletedAt) {
            throw new Prisma.PrismaClientKnownRequestError(
              `No ${model} found`,
              { code: 'P2025', clientVersion: Prisma.prismaVersion.client },
            );
          }
          return result;
        },
        async findFirst({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async findFirstOrThrow({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async findMany({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async count({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async aggregate({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async groupBy({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async delete({ model, args }) {
          if (!isSoftDeleteModel(model)) {
            throw new Error(
              `softDeleteExtension: delete intercepted for non-soft-delete model ${model}`,
            );
          }
          const delegate = (client as unknown as Record<string, {
            update: (payload: unknown) => Promise<unknown>;
          }>)[lowercaseFirst(model)];
          return delegate.update({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ model, args }) {
          if (!isSoftDeleteModel(model)) {
            throw new Error(
              `softDeleteExtension: deleteMany intercepted for non-soft-delete model ${model}`,
            );
          }
          const delegate = (client as unknown as Record<string, {
            updateMany: (payload: unknown) => Promise<unknown>;
          }>)[lowercaseFirst(model)];
          return delegate.updateMany({
            where: { ...(args.where ?? {}), deletedAt: null },
            data: { deletedAt: new Date() },
          });
        },
        async update({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
        async updateMany({ model, args, query }) {
          if (!isSoftDeleteModel(model)) return query(args);
          return query(mergeDeletedAtFilter(args));
        },
      },
    },
  }),
);
