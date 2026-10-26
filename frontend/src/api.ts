export type TextEntity = {
  start: number;
  end: number;
  label: string;
  kind: string;
  hashtag: string | null;
  user: { id: string; username: string } | null;
};
export type User = {
  gender?: string | null;
  occupation?: string | null;
  skills?: string[];
  onboardingStage?: string;
  profileCoverMediaId?: string | null;
  campusIdentity?: string | null;
  blocked?: boolean;
  id: string;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  location?: string | null;
  avatarMediaId?: string | null;
  username: string;
  displayName: string;
  bio: string | null;
  createdAt?: string;
  email?: string;
  emailVerified?: boolean;
  website?: string | null;
  department?: string | null;
  followers?: number;
  following?: number;
  isFollowing?: boolean;
  permissions?: string[];
  roles?: string[];
  interests?: { topicId: string; topic: Topic }[];
};
export type Topic = { id: string; slug: string; name: string };
export type Community = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: string;
  joined: boolean;
  _count: { members: number };
};
export type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverMediaId?: string | null;
  coverAlt?: string | null;
  body?: string;
  bodyFormat?: string;
  discussion?: Post;
  status?: string;
  publishedAt: string | null;
  sourceUrl?: string;
  legacySource?: string;
  author: User;
};
export type Preview = {
  id?: string;
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
};
export type QuotedPost = {
  quotedPost?: QuotedPost | null;
  quotedPostId?: string | null;
  tokens?: TextEntity[];
  id: string;
  body: string;
  createdAt: string;
  author: User;
  imageMediaId?: string | null;
  imageAlt?: string | null;
  linkPreview?: Preview | null;
  article?: {
    slug: string;
    title: string;
    excerpt: string;
    coverMediaId?: string | null;
    coverAlt?: string | null;
  } | null;
};
export type Post = {
  threadRootId?: string | null;
  isThreadContinuation?: boolean;
  authorReply?: boolean;
  threadCount: number;
  sportsCompetition?: { id: string; name: string } | null;
  sportsMatch?: { id: string; home: { name: string }; away: { name: string } } | null;
  tokens?: TextEntity[];
  replyPolicy?: 'EVERYONE' | 'FOLLOWING';
  feedId?: string;
  feedCreatedAt?: string;
  repostedBy?: User | null;
  repostedAt?: string | null;
  quotedPostId?: string | null;
  quotedPost?: QuotedPost | null;
  linkPreview?: Preview | null;
  id: string;
  article?: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverMediaId?: string | null;
    coverAlt?: string | null;
  } | null;
  body: string;
  imageMediaId?: string | null;
  imageAlt?: string | null;
  parentId: string | null;
  createdAt: string;
  author: User;
  community?: { id: string; slug: string; name: string } | null;
  topic?: Topic | null;
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean };
  _count: {
    replies: number;
    likes: number;
    reposts: number;
    quotes?: number;
    bookmarks?: number;
    views: number;
  };
};
export type Page = {
  feedAsOf?: string;
  requiresLogin?: boolean;
  data: Post[];
  nextCursor: string | null;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Unable to connect. Check your connection and try again.');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
    throw new ApiError(
      response.status,
      response.status === 429
        ? 'Please slow down and try again in a minute.'
        : response.status >= 500
          ? 'Something went wrong. Please try again shortly.'
          : message || 'Request could not be completed.',
    );
  }
  return data as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export const mediaUrl = (id: string) =>
  `${import.meta.env.VITE_API_URL || '/api/v1'}/media/${encodeURIComponent(id)}`;
