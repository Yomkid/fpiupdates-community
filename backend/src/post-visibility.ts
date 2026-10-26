import type { Prisma } from '@prisma/client';
export function visibleAuthor(viewer?: string, hideMuted = false): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    ...(viewer
      ? {
          blocks: { none: { blockedId: viewer } },
          blockedBy: { none: { blockerId: viewer } },
          ...(hideMuted ? { mutedBy: { none: { muterId: viewer } } } : {}),
        }
      : {}),
  };
}
export function postVisibility(viewer?: string, hideMuted = false): Prisma.PostWhereInput {
  return {
    status: 'PUBLISHED',
    deletedAt: null,
    author: visibleAuthor(viewer, hideMuted),
    AND: [
      { OR: [{ sportsCompetitionId: null }, { sportsCompetition: { published: true } }] },
      { OR: [{ communityId: null }, { community: { active: true } }] },
      {
        OR: [
          { article: null },
          { article: { status: 'PUBLISHED', author: visibleAuthor(viewer, hideMuted) } },
        ],
      },
      { OR: [{ replyPolicyOwnerId: null }, { replyPolicyOwner: visibleAuthor(viewer) }] },
    ],
  };
}
export const visible = postVisibility();
