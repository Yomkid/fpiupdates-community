import { VerifiedBadge } from './Identity';
import { watchEngagements } from './LiveEngagements';
import { MetricCount, ShareMenu } from './EngagementUI';
import { useFeatures } from './Features';
import { ViewImage } from './ImageTools';
import { Avatar } from './Avatar';
import { detectedLinks } from './links';
import { EmojiButton } from './EmojiButton';
import { EmojiText } from './EmojiText';
import { FollowAction, JoinPrompt } from './Conversations';
import { useInteractions } from './interactions';
import { CharacterCount, ExtraThreadPart } from './PostLength';
import { useNavigationType } from 'react-router-dom';
import { EntityTextarea } from './EntityTextarea';
import type { TextEntity } from './api';
import { useId, useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Send,
  Trash2,
  X,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  BarChart3,
  Heart,
  Repeat2,
  Bookmark,
  Eye,
  ImagePlus,
  Hash,
  Globe,
  Users,
  ChevronDown,
  LoaderCircle,
} from 'lucide-react';
import { SafetyControls } from './Safety';
import { toast, useToastNotice } from './toast';
import { ComposerLinkPreview, PublishedLinkPreview, LinkPreviewCard } from './LinkPreview';
import { ImageUpload } from './ImageUpload';
import {
  api,
  mediaUrl,
  ApiError,
  errorMessage,
  type QuotedPost,
  type Post,
  type Page,
  type User,
  type Community,
  type Topic,
} from './api';
import { useSession } from './session';
export { Avatar } from './Avatar';
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  useToastNotice(message, 'error');
  return retry ? (
    <button className="text-button retry-button" onClick={retry}>
      Try again
    </button>
  ) : null;
}
export function QuoteCard({
  post,
  id,
  depth = 0,
}: {
  post: QuotedPost | null | undefined;
  id?: string | null;
  depth?: number;
}) {
  const navigate = useNavigate();
  if (!post)
    return id ? <div className="quote-unavailable">Original post is unavailable.</div> : null;
  return (
    <div
      className={`quote-card ${depth ? 'nested-quote' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button') || window.getSelection()?.toString())
          return;
        e.stopPropagation();
        navigate(post.article ? `/articles/${post.article.slug}` : `/posts/${post.id}`);
      }}
    >
      <Link className="quote-author" to={`/u/${post.author.username}`}>
        <Avatar user={post.author} />
        <strong>
          {post.author.displayName}
          <VerifiedBadge user={post.author} />
        </strong>
        <span>@{post.author.username}</span>
      </Link>
      <div className="quote-body">
        {post.article ? (
          <Link to={`/articles/${post.article.slug}`}>
            <strong>{post.article.title}</strong>
            <p>{post.article.excerpt}</p>
          </Link>
        ) : (
          <>
            <LinkText text={post.body} tokens={post.tokens} />
            <Link className="quote-open" to={`/posts/${post.id}`}>
              Open original post →
            </Link>
          </>
        )}
      </div>
      {post.quotedPostId &&
        (depth < 1 ? (
          <QuoteCard depth={depth + 1} post={post.quotedPost} id={post.quotedPostId} />
        ) : (
          <Link className="quote-open" to={'/posts/' + post.quotedPostId}>
            View earlier quoted post →
          </Link>
        ))}
      {(post.imageMediaId || post.article?.coverMediaId) && (
        <ViewImage
          className="quoted-image"
          src={mediaUrl((post.imageMediaId || post.article?.coverMediaId)!)}
          alt={post.imageAlt || post.article?.coverAlt || 'Image in original post'}
        />
      )}
      {!post.imageMediaId && !post.article && (
        <PublishedLinkPreview body={post.body} preview={post.linkPreview} />
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  open = true,
}: {
  open?: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const initialClose = useRef(onClose);
  initialClose.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open) dialog.showModal();
    else dialog.close();
    if (open) dialog.querySelector<HTMLTextAreaElement>('textarea[data-autofocus="true"]')?.focus();
    const cancel = () => initialClose.current();
    dialog.addEventListener('cancel', cancel);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
      if (previous?.isConnected)
        requestAnimationFrame(() => previous.focus({ preventScroll: true }));
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'composer-modal' : ''}`}
      aria-labelledby={headingId}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={headingId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Composer({
  compact = false,
  sportsCompetitionId,
  sportsMatchId,
  parentId,
  communityId,
  quotedPost,
  onPublished,
  autoFocus = false,
}: {
  compact?: boolean;
  sportsCompetitionId?: string;
  sportsMatchId?: string;
  parentId?: string;
  communityId?: string;
  quotedPost?: Post;
  onPublished: (post: Post) => void;
  autoFocus?: boolean;
}) {
  const { flags, uploadsAvailable } = useFeatures();
  const composerId = useId();
  const { user } = useSession();
  const ui = useInteractions();
  const [parts, setParts] = useState<string[]>([]);
  const requestId = useRef(crypto.randomUUID());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [imageMediaId, setImageMediaId] = useState<string | null>(null);
  const [imageKey, setImageKey] = useState(0);
  const [focused, setFocused] = useState(autoFocus);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topicId, setTopicId] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [audience, setAudience] = useState(communityId ?? '');
  const [replyPolicy, setReplyPolicy] = useState('EVERYONE');
  useEffect(() => {
    api<Topic[]>('/catalog/topics')
      .then(setTopics)
      .catch(() => {});
    if (user && !parentId && !communityId)
      api<Community[]>('/catalog/communities')
        .then((rows) => setCommunities(rows.filter((x) => x.joined)))
        .catch(() => {});
  }, [user?.id, parentId, communityId]);
  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height =
        Math.min(360, Math.max(focused ? 100 : 52, textarea.current.scrollHeight)) + 'px';
    }
  }, [body, focused]);
  useEffect(() => {
    if (autoFocus) textarea.current?.focus();
  }, [autoFocus]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !body.trim() ||
      Array.from(body).length > 280 ||
      parts.some((p) => !p.trim() || Array.from(p).length > 280) ||
      busy ||
      uploading
    )
      return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const post = await api<Post>(parts.length ? '/posts/thread' : '/posts', {
        method: 'POST',
        body: JSON.stringify({
          ...(parts.length ? { continuations: parts, requestId: requestId.current } : {}),
          ...(sportsCompetitionId ? { sportsCompetitionId } : {}),
          ...(sportsMatchId ? { sportsMatchId } : {}),
          body: body.trim(),
          ...(quotedPost ? { quotedPostId: quotedPost.id } : {}),
          ...(flags.postImages && uploadsAvailable && imageMediaId
            ? { imageMediaId, imageAlt: String(form.get('imageAlt') ?? '') }
            : {}),
          ...(communityId || audience ? { communityId: communityId || audience } : {}),
          ...(topicId ? { topicId } : {}),
          ...(parentId ? { parentId } : { replyPolicy }),
        }),
      });
      setBody('');
      setParts([]);
      requestId.current = crypto.randomUUID();
      setImageMediaId(null);
      setImageKey((n) => n + 1);
      setFocused(autoFocus);
      toast(
        parts.length
          ? 'Thread published.'
          : quotedPost
            ? 'Quote sent.'
            : parentId
              ? 'Reply sent.'
              : 'Post sent.',
        'success',
        { label: 'View', href: '/posts/' + post.id },
      );
      onPublished(post);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Your session expired. Copy your draft, then sign out and sign in again.'
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  if (user && !user.emailVerified)
    return (
      <div className="email-participation-note">
        <strong>Confirm your email to reply or post</strong>
        <p>Public conversations remain available to read.</p>
        <Link
          className="content-link"
          to={
            '/check-email?next=' +
            encodeURIComponent(window.location.pathname + window.location.search)
          }
        >
          Verify your email →
        </Link>
      </div>
    );
  if (!user)
    return (
      <div className="join-composer">
        <div>
          <strong>Be part of the conversation.</strong>
          <p>Sign in to share a thought or reply.</p>
        </div>
        <button type="button" className="button primary small" onClick={() => ui.auth()}>
          Sign in
        </button>
      </div>
    );
  return (
    <form
      className={`composer social-composer ${focused || body || imageMediaId ? 'composer-expanded' : ''} ${compact && !focused && !body && !imageMediaId ? 'composer-collapsed' : ''}`}
      onSubmit={submit}
    >
      <Avatar user={user} />
      <div className="composer-content">
        {!parentId && (focused || body) && (
          <div className="composer-audience">
            <Globe size={14} />
            {communityId ? (
              <span>Community post</span>
            ) : (
              <select
                aria-label="Post audience"
                title="Choose where to post. Community posts are public."
                value={audience}
                disabled={busy || uploading}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value="">Everyone</option>
                {communities.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <ChevronDown size={13} />
          </div>
        )}
        {!parentId && (sportsMatchId || sportsCompetitionId) && (
          <p className="composer-sports-context">
            {sportsMatchId
              ? 'Posting to this match discussion'
              : 'Posting to this competition discussion'}
          </p>
        )}
        <label className="sr-only" htmlFor={composerId}>
          {parentId ? 'Your reply' : 'Your post'}
        </label>
        <EntityTextarea
          inputRef={textarea}
          id={composerId}
          value={body}
          disabled={busy}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onChange={setBody}
          placeholder={parentId ? 'Post your reply' : 'What’s happening?'}
        />
        <ComposerLinkPreview body={body} />
        {quotedPost && <QuoteCard post={quotedPost} />}
        {flags.postImages && uploadsAvailable && (
          <ImageUpload
            key={imageKey}
            compact
            inputRef={imageInput}
            kind="post"
            name="imageMediaId"
            altName="imageAlt"
            onChange={setImageMediaId}
            onBusyChange={setUploading}
          />
        )}
        {!parentId && (focused || body) && (
          <label className="reply-policy">
            <Users size={14} />
            <select
              aria-label="Who can reply"
              value={replyPolicy}
              disabled={busy}
              onChange={(e) => setReplyPolicy(e.target.value)}
            >
              <option value="EVERYONE">Everyone can reply</option>
              <option value="FOLLOWING">Only accounts you follow can reply</option>
            </select>
          </label>
        )}
        {topicOpen && (
          <label className="composer-topic">
            Topic
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">General conversation</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {parts.length > 0 && (
          <div className="thread-parts">
            {parts.map((p, i) => (
              <ExtraThreadPart
                key={i}
                value={p}
                index={i + 2}
                disabled={busy}
                onChange={(v) => setParts((old) => old.map((x, n) => (n === i ? v : x)))}
                onRemove={() => setParts((old) => old.filter((_, n) => n !== i))}
              />
            ))}
          </div>
        )}
        <div className="composer-toolbar">
          <div className="composer-tools">
            <EmojiButton
              inputRef={textarea}
              value={body}
              onChange={setBody}
              disabled={busy || uploading}
            />
            {flags.postImages && uploadsAvailable && (
              <button
                className="icon-button"
                type="button"
                aria-label="Add image"
                title="Add image"
                disabled={uploading || busy}
                onClick={() => imageInput.current?.click()}
              >
                {uploading ? <LoaderCircle size={20} className="spin" /> : <ImagePlus size={20} />}
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="Choose topic"
              title="Choose topic"
              aria-expanded={topicOpen}
              onClick={() => setTopicOpen(!topicOpen)}
            >
              <Hash size={19} />
            </button>
          </div>
          <CharacterCount value={body} />
          {!parentId && parts.length < 9 && (
            <button
              type="button"
              className="icon-button add-thread-part"
              aria-label="Add another post to thread"
              disabled={busy}
              onClick={() => setParts((p) => [...p, ''])}
            >
              ＋
            </button>
          )}
          <button
            className="button primary small"
            disabled={
              !body.trim() ||
              Array.from(body).length > 280 ||
              parts.some((p) => !p.trim() || Array.from(p).length > 280) ||
              busy ||
              uploading
            }
          >
            {busy ? 'Sending…' : parts.length ? 'Post all' : parentId ? 'Reply' : 'Post'}
          </button>
        </div>
        {error && <ErrorBox message={error} />}
      </div>
    </form>
  );
}
export function ReplyPopup({
  post,
  onClose,
  onReplied,
}: {
  post: Post;
  onClose: () => void;
  onReplied: () => void;
}) {
  return (
    <Modal title="Reply" wide onClose={onClose}>
      <div className="reply-source">
        <Avatar user={post.author} />
        <div>
          <Link to={`/u/${post.author.username}`}>
            <strong>
              {post.author.displayName}
              <VerifiedBadge user={post.author} />
            </strong>{' '}
            <span>@{post.author.username}</span>
          </Link>
          <p>{post.article?.title ?? post.body}</p>
          <small>
            Replying to <Link to={`/u/${post.author.username}`}>@{post.author.username}</Link>
          </small>
        </div>
      </div>
      <Composer
        autoFocus
        parentId={post.id}
        communityId={post.community?.id}
        onPublished={() => {
          onReplied();
          onClose();
        }}
      />
    </Modal>
  );
}
function PostBody({ post, detail }: { post: Post; detail: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [post.id]);
  useEffect(() => {
    const el = ref.current;
    if (!el || detail || expanded) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.body, detail, expanded]);
  return (
    <>
      <p ref={ref} className={'post-body' + (!detail && !expanded ? ' text-collapsed' : '')}>
        <LinkText text={post.body} tokens={post.tokens} />
      </p>
      {!detail && overflows && (
        <button
          type="button"
          className="text-button post-text-toggle"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
}
export function PostCard({
  post: initialPost,
  onDeleted,
  discussionOnly = false,
  detail = false,
  afterContent,
  onReplied,
  replyTo,
}: {
  replyTo?: { id: string; username: string };
  onReplied?: () => void;
  afterContent?: ReactNode;
  detail?: boolean;
  post: Post;
  discussionOnly?: boolean;
  onDeleted?: (id: string) => void;
}) {
  const ui = useInteractions();
  const metricsHold = useRef(0);
  const [post, setPost] = useState(initialPost);
  useEffect(() => setPost(initialPost), [initialPost]);
  const articleRef = useRef<HTMLElement>(null);
  const [engaging, setEngaging] = useState(false);
  const [repostMenu, setRepostMenu] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [replying, setReplying] = useState(false);
  const { user } = useSession();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<'report' | 'delete' | null>(null);
  const [reason, setReason] = useState('SCAM');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useToastNotice(notice);
  useEffect(() => {
    const element = articleRef.current;
    if (!element) return;
    let stop: (() => void) | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          if (!stop)
            stop = watchEngagements(post.id, user?.id ?? 'guest', (metrics) => {
              if (Date.now() >= metricsHold.current)
                setPost((p) => ({ ...p, _count: metrics._count, viewer: metrics.viewer }));
            });
        } else {
          stop?.();
          stop = undefined;
        }
      },
      { rootMargin: '80px 0px', threshold: 0 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      stop?.();
    };
  }, [post.id, user?.id]);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ userId: string; post: Post }>).detail;
      if (detail.userId === user?.id && detail.post.id === post.id)
        setPost((p) => ({
          ...p,
          ...detail.post,
          feedId: p.feedId,
          repostedBy: p.repostedBy,
          repostedAt: p.repostedAt,
        }));
    };
    window.addEventListener('post-updated', handler);
    return () => window.removeEventListener('post-updated', handler);
  }, [post.id, user?.id]);
  useEffect(() => {
    if (!user || !articleRef.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recorded = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].intersectionRatio >= 0.5 && !recorded) {
          timer = setTimeout(() => {
            recorded = true;
            api<{ views: number }>(`/social/posts/${post.id}/view`, { method: 'POST' })
              .then((x) => setPost((p) => ({ ...p, _count: { ...p._count, views: x.views } })))
              .catch(() => {});
          }, 1000);
        } else if (timer) clearTimeout(timer);
      },
      { threshold: [0.5] },
    );
    observer.observe(articleRef.current);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [post.id, user?.id]);
  async function engage(kind: 'likes' | 'reposts' | 'bookmarks') {
    if (!user) {
      ui.auth();
      return;
    }
    if (!user.emailVerified) {
      navigate(
        '/check-email?next=' +
          encodeURIComponent(window.location.pathname + window.location.search),
      );
      return;
    }
    if (engaging) return;
    metricsHold.current = Date.now() + 30000;
    setEngaging(true);
    try {
      const active =
        kind === 'likes'
          ? post.viewer?.liked
          : kind === 'reposts'
            ? post.viewer?.reposted
            : post.viewer?.bookmarked;
      const result = await api<Post>(`/social/posts/${post.id}/${kind}`, {
        method: active ? 'DELETE' : 'PUT',
      });
      setPost({
        ...result,
        feedId: post.feedId,
        repostedBy: post.repostedBy,
        repostedAt: post.repostedAt,
      });
      window.dispatchEvent(
        new CustomEvent('post-updated', { detail: { userId: user.id, post: result } }),
      );
      if (kind === 'reposts') {
        toast(active ? 'Repost removed.' : 'Reposted.', 'success');
        window.dispatchEvent(new Event('feed-updated'));
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      metricsHold.current = Date.now() + 1500;
      setEngaging(false);
    }
  }
  async function action(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (modal === 'delete') {
        await api(`/posts/${post.id}`, { method: 'DELETE' });
        setModal(null);
        onDeleted?.(post.id);
      } else {
        const ticket = await api<{ id: string }>(`/posts/${post.id}/reports`, {
          method: 'POST',
          body: JSON.stringify({ reason, ...(details.trim() ? { details: details.trim() } : {}) }),
        });
        setModal(null);
        setNotice(`Report saved. Reference: ${ticket.id.slice(0, 8)}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${post.article ? `/articles/${post.article.slug}` : `/posts/${post.id}`}`,
      );
      setNotice('Link copied');
    } catch {
      setNotice(`Share this address: ${location.origin}/posts/${post.id}`);
    }
    setMenu(false);
  }
  const destination = post.article ? `/articles/${post.article.slug}` : `/posts/${post.id}`;
  return (
    <article
      data-post-id={post.id}
      className={`post-card ${detail ? 'post-detail' : ''} ${discussionOnly || detail ? '' : 'clickable-post'}`}
      ref={articleRef}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          detail ||
          discussionOnly ||
          target.closest('a,button,input,textarea,select,label,summary,dialog,[role="button"]') ||
          window.getSelection()?.toString()
        )
          return;
        navigate(destination);
      }}
    >
      {post.repostedBy && (
        <div className="repost-attribution">
          <Repeat2 size={14} />
          <Link to={`/u/${post.repostedBy.username}`}>
            {post.repostedBy.id === user?.id ? 'You' : post.repostedBy.displayName} reposted
          </Link>
        </div>
      )}
      <Link to={`/u/${post.author.username}`} tabIndex={-1} aria-hidden="true">
        <Avatar user={post.author} />
      </Link>
      <div className="post-content">
        <div className="post-top">
          <div className="post-author">
            <span className="author-identity">
              <Link
                to={`/u/${post.author.username}`}
                className="author-name"
                title={post.author.displayName}
              >
                {post.author.displayName}
              </Link>
              <VerifiedBadge user={post.author} />
            </span>
            <span className="author-handle" title={'@' + post.author.username}>
              @{post.author.username}
            </span>
            <span className="dot">·</span>
            <Link
              to={post.article ? `/articles/${post.article.slug}` : `/posts/${post.id}`}
              className="post-time"
            >
              <time dateTime={post.createdAt}>
                {new Intl.DateTimeFormat('en-NG', { month: 'short', day: 'numeric' }).format(
                  new Date(post.createdAt),
                )}
              </time>
            </Link>
          </div>
          <div className="post-menu">
            {detail && <FollowAction author={post.author} />}
            <button
              className="icon-button"
              aria-label={`Options for post by ${post.author.username}`}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menu && (
              <div className="dropdown">
                <button onClick={() => void copyLink()}>
                  <Copy size={15} />
                  Copy link
                </button>
                {user?.id === post.author.id && !post.parentId && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          await api('/users/me/pinned-post', {
                            method: 'PUT',
                            body: JSON.stringify({ postId: post.id }),
                          });
                          toast('Pinned to your profile.', 'success');
                          window.dispatchEvent(new Event('profile-updated'));
                          setMenu(false);
                        } catch (e) {
                          setNotice(errorMessage(e));
                        }
                      }}
                    >
                      Pin to profile
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api('/users/me/pinned-post', {
                            method: 'PUT',
                            body: JSON.stringify({ postId: null }),
                          });
                          toast('Profile pin cleared.', 'success');
                          window.dispatchEvent(new Event('profile-updated'));
                          setMenu(false);
                        } catch (e) {
                          setNotice(errorMessage(e));
                        }
                      }}
                    >
                      Clear profile pin
                    </button>
                  </>
                )}
                {menu && user && user.id !== post.author.id && (
                  <SafetyControls
                    account={post.author}
                    onChange={(state) => {
                      if (state.blocked) {
                        if (onDeleted) onDeleted(post.id);
                        else navigate('/');
                      }
                    }}
                  />
                )}
                {user?.id === post.author.id && !post.article ? (
                  <button
                    className="danger-text"
                    onClick={() => {
                      setModal('delete');
                      setMenu(false);
                    }}
                  >
                    <Trash2 size={15} />
                    Delete post
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMenu(false);
                      user ? setModal('report') : ui.auth();
                    }}
                  >
                    <Flag size={15} />
                    Report post
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {post.parentId &&
          !(!detail && post.isThreadContinuation && replyTo?.username === post.author.username) &&
          (replyTo ? (
            <span className="reply-context">
              Replying to <Link to={'/u/' + replyTo.username}>@{replyTo.username}</Link>
              <Link
                className="reply-parent-link"
                aria-label="View parent post"
                to={'/posts/' + post.parentId}
              >
                <ArrowUpRight size={12} />
              </Link>
            </span>
          ) : (
            <Link className="reply-context" to={'/posts/' + post.parentId}>
              View parent post <ArrowUpRight size={12} />
            </Link>
          ))}
        {post.community && (
          <Link className="reply-context" to={`/communities/${post.community.slug}`}>
            {post.community.name}
          </Link>
        )}
        {post.sportsCompetition && (
          <div className="post-sports-context">
            <Link
              to={
                post.sportsMatch
                  ? '/sports/matches/' + post.sportsMatch.id
                  : '/sports/' + post.sportsCompetition.id
              }
            >
              {post.sportsMatch
                ? `${post.sportsMatch.home.name} vs ${post.sportsMatch.away.name}`
                : post.sportsCompetition.name}{' '}
              · Discussion
            </Link>
          </div>
        )}
        {discussionOnly ? null : post.article ? (
          <Link className="article-feed-card" to={`/articles/${post.article.slug}`}>
            <span className="eyebrow">ARTICLE</span>
            {post.article.coverMediaId && (
              <img
                className="article-cover-card"
                src={mediaUrl(post.article.coverMediaId)}
                alt={post.article.coverAlt ?? ''}
                loading="lazy"
              />
            )}
            <h2>{post.article.title}</h2>
            <p>{post.article.excerpt}</p>
            <span className="text-button">Read article →</span>
          </Link>
        ) : (
          <PostBody post={post} detail={detail} />
        )}
        {post.imageMediaId && (
          <ViewImage
            className="post-image"
            src={mediaUrl(post.imageMediaId)}
            alt={post.imageAlt || 'Image attached to this post'}
          />
        )}
        {!post.imageMediaId && !post.article && (
          <PublishedLinkPreview body={post.body} preview={post.linkPreview} />
        )}
        <QuoteCard post={post.quotedPost} id={post.quotedPostId} />
        {!post.parentId && post.threadCount > 1 && (
          <Link className="thread-indicator" to={destination}>
            View thread · {post.threadCount} posts →
          </Link>
        )}
        {detail && (
          <div className="post-detail-metadata">
            <time dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleString('en-NG', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
            {post._count.views > 0 && (
              <span>
                {' '}
                ·{' '}
                <strong>
                  <MetricCount value={post._count.views} />
                </strong>{' '}
                Views
              </span>
            )}
          </div>
        )}
        <div className="post-actions social-actions">
          <button
            aria-label={`Reply to @${post.author.username}`}
            title="Reply"
            onClick={() => {
              if (!user) {
                ui.auth();
                return;
              }
              if (!user.emailVerified) {
                navigate(
                  '/check-email?next=' +
                    encodeURIComponent(window.location.pathname + window.location.search),
                );
                return;
              }
              setReplying(true);
            }}
          >
            <MessageCircle size={18} />
            <MetricCount value={post._count.replies} />
          </button>
          <div className="repost-control">
            <button
              aria-label="Repost options"
              aria-expanded={repostMenu}
              aria-pressed={!!post.viewer?.reposted}
              title={`${post._count.reposts} reposts · ${post._count.quotes ?? 0} quotes`}
              onClick={() => {
                if (!user) {
                  ui.auth();
                  return;
                }
                if (!user.emailVerified) {
                  navigate(
                    '/check-email?next=' +
                      encodeURIComponent(window.location.pathname + window.location.search),
                  );
                  return;
                }
                setRepostMenu(!repostMenu);
              }}
            >
              <Repeat2 size={18} />
              <MetricCount value={post._count.reposts + (post._count.quotes ?? 0)} />
            </button>
            {repostMenu && (
              <div className="dropdown repost-dropdown">
                <button
                  disabled={engaging}
                  onClick={() => {
                    setRepostMenu(false);
                    void engage('reposts');
                  }}
                >
                  {post.viewer?.reposted ? 'Undo repost' : 'Repost'}
                </button>
                <button
                  onClick={() => {
                    setRepostMenu(false);
                    setQuoting(true);
                  }}
                >
                  Quote
                </button>
              </div>
            )}
          </div>
          <button
            aria-label={post.viewer?.liked ? 'Unlike post' : 'Like post'}
            aria-pressed={!!post.viewer?.liked}
            title="Like"
            disabled={engaging}
            onClick={() => void engage('likes')}
          >
            <Heart size={18} fill={post.viewer?.liked ? 'currentColor' : 'none'} />
            <MetricCount value={post._count.likes} />
          </button>
          {!detail && (
            <span
              className="view-count"
              aria-label={`${post._count.views} member views`}
              title="Signed-in member views, counted once per member per UTC day"
            >
              <BarChart3 size={17} />
              <MetricCount value={post._count.views} />
            </span>
          )}
          <button
            aria-label={post.viewer?.bookmarked ? 'Remove bookmark' : 'Bookmark post'}
            aria-pressed={!!post.viewer?.bookmarked}
            title="Bookmark"
            disabled={engaging}
            onClick={() => void engage('bookmarks')}
          >
            <Bookmark size={18} fill={post.viewer?.bookmarked ? 'currentColor' : 'none'} />
            {detail && <MetricCount value={post._count.bookmarks ?? 0} />}
          </button>
          <ShareMenu post={post} disabled={engaging} onBookmark={() => void engage('bookmarks')} />
        </div>
      </div>
      {afterContent}
      {replying && (
        <ReplyPopup
          post={post}
          onClose={() => setReplying(false)}
          onReplied={() => {
            setPost((p) => ({ ...p, _count: { ...p._count, replies: p._count.replies + 1 } }));
            onReplied?.();
          }}
        />
      )}{' '}
      {quoting && (
        <Modal wide title="Quote this post" onClose={() => setQuoting(false)}>
          <Composer
            autoFocus
            quotedPost={post}
            onPublished={() => {
              setQuoting(false);
              window.dispatchEvent(new Event('feed-updated'));
            }}
          />
        </Modal>
      )}
      {modal && (
        <Modal
          title={modal === 'delete' ? 'Delete this post?' : 'Report this post'}
          onClose={() => {
            if (!busy) {
              setModal(null);
              setError('');
            }
          }}
        >
          <form onSubmit={action}>
            {modal === 'delete' ? (
              <p className="muted">Your post will be removed from public view.</p>
            ) : (
              <>
                <p className="muted">Help us understand what’s wrong. Reports are private.</p>
                <label>
                  Reason
                  <select value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="SCAM">Scam or fraud</option>
                    <option value="IMPERSONATION">Impersonation</option>
                    <option value="THREAT">Threat or dangerous activity</option>
                    <option value="HARASSMENT">Harassment</option>
                    <option value="OTHER">Something else</option>
                  </select>
                </label>
                <label>
                  Additional details <span className="muted">(optional)</span>
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                </label>
                <p className="form-note">
                  This beta is not an emergency service. If there is immediate danger, contact local
                  emergency services.
                </p>
              </>
            )}
            {error && <ErrorBox message={error} />}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                className={`button ${modal === 'delete' ? 'danger' : 'primary'}`}
                disabled={busy}
              >
                {busy ? 'Saving…' : modal === 'delete' ? 'Delete post' : 'Submit report'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </article>
  );
}
const feedCache = new Map<
  string,
  { posts: Post[]; cursor: string | null; requiresLogin: boolean; feedAsOf?: string; time: number }
>();
window.addEventListener('feed-updated', () => feedCache.clear());
window.addEventListener('post-updated', (event) => {
  const { userId, post } = (event as CustomEvent<{ userId: string; post: Post }>).detail;
  for (const [key, page] of feedCache)
    if (key.startsWith(userId))
      page.posts = page.posts.map((p) =>
        p.id === post.id
          ? { ...p, ...post, feedId: p.feedId, repostedBy: p.repostedBy, repostedAt: p.repostedAt }
          : p,
      );
});
export function PostList({
  live = false,
  endpoint,
  refreshKey = 0,
  emptyTitle = 'The conversation starts with you.',
  emptyText = 'Ask a question, share a campus moment, or simply say hello.',
}: {
  live?: boolean;
  endpoint: string;
  refreshKey?: number;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const [nearTop, setNearTop] = useState(window.scrollY < 160);
  useEffect(() => {
    if (!live) return;
    const update = () => setNearTop(window.scrollY < 160);
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [live]);
  const { user } = useSession();
  const navigationType = useNavigationType();
  const cacheKey = (user?.id ?? 'guest') + endpoint;
  const restoration = useRef({
    key: cacheKey,
    page: navigationType === 'POP' ? feedCache.get(cacheKey) : undefined,
  });
  const [requiresLogin, setRequiresLogin] = useState(false);
  const loadedKey = useRef<string | null>(null);
  const generation = useRef(0);
  const feedAsOf = useRef<string | undefined>(undefined);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry((n) => n + 1);
    window.addEventListener('feed-updated', refresh);
    return () => window.removeEventListener('feed-updated', refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setLoadingMore(false);
    const cached =
      restoration.current.key === cacheKey && refreshKey === 0 && retry === 0
        ? restoration.current.page
        : undefined;
    if (cached && Date.now() - cached.time < 300000) {
      loadedKey.current = cacheKey;
      feedAsOf.current = cached.feedAsOf;
      setPosts(cached.posts);
      setCursor(cached.cursor);
      setRequiresLogin(cached.requiresLogin);
      setLoading(false);
      return () => controller.abort();
    }
    loadedKey.current = null;
    setLoading(true);
    setError('');
    setPosts([]);
    setCursor(null);
    api<Page>(endpoint + (endpoint.includes('?') ? '&' : '?') + 'limit=15', {
      signal: controller.signal,
    })
      .then((page) => {
        if (!controller.signal.aborted) {
          loadedKey.current = cacheKey;
          feedAsOf.current = page.feedAsOf;
          setPosts(page.data);
          setCursor(page.nextCursor);
          setRequiresLogin(!!page.requiresLogin);
          feedCache.set(cacheKey, {
            posts: page.data,
            cursor: page.nextCursor,
            requiresLogin: !!page.requiresLogin,
            feedAsOf: page.feedAsOf,
            time: Date.now(),
          });
          if (feedCache.size > 30) feedCache.delete(feedCache.keys().next().value!);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current += 1;
    };
  }, [endpoint, refreshKey, retry, user?.id]);
  async function more() {
    if (!cursor || loadingMore) return;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    setError('');
    try {
      const page = await api<Page>(
        endpoint +
          (endpoint.includes('?') ? '&' : '?') +
          new URLSearchParams({ limit: '15', cursor }),
      );
      if (currentGeneration !== generation.current) return;
      setPosts((old) => [
        ...old,
        ...page.data.filter((p) => !old.some((x) => (x.feedId ?? x.id) === (p.feedId ?? p.id))),
      ]);
      setCursor(page.nextCursor);
      setRequiresLogin(!!page.requiresLogin);
    } catch (e) {
      if (currentGeneration === generation.current) setError(errorMessage(e));
    } finally {
      if (currentGeneration === generation.current) setLoadingMore(false);
    }
  }
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
  const [noticeSlot, setNoticeSlot] = useState(false);
  useEffect(() => {
    if (nearTop && pendingPosts.length) setNoticeSlot(true);
  }, [nearTop, pendingPosts.length]);
  const observed = useRef(posts);
  observed.current = posts;
  useEffect(() => {
    setPendingPosts([]);
    setNoticeSlot(false);
    if (!live || !user || loading) return;
    const controller = new AbortController();
    let running = false;
    async function check() {
      if (running || document.hidden) return;
      running = true;
      try {
        const pollEndpoint = endpoint.replace('mode=for-you', 'mode=latest');
        const next = await api<Page>(
          pollEndpoint + (pollEndpoint.includes('?') ? '&' : '?') + 'limit=50',
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const current = observed.current;
        const stamp = (p: Post) => p.feedCreatedAt ?? p.repostedAt ?? p.createdAt;
        const head = current.reduce<Post | undefined>(
          (best, p) => (!best || stamp(p) > stamp(best) ? p : best),
          undefined,
        );
        const newer = next.data.filter(
          (p) =>
            !current.some((old) => (old.feedId ?? old.id) === (p.feedId ?? p.id)) &&
            (feedAsOf.current
              ? stamp(p) > feedAsOf.current
              : !head ||
                stamp(p) > stamp(head) ||
                (stamp(p) === stamp(head) && (p.feedId ?? p.id) > (head.feedId ?? head.id))),
        );
        setPendingPosts(newer);
      } catch {
        /* Feed polling must never interrupt reading. */
      } finally {
        running = false;
      }
    }
    const timer = setInterval(() => void check(), 20000);
    const wake = () => void check();
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [live, endpoint, user?.id, loading, refreshKey, retry]);
  useEffect(() => {
    const update = (event: Event) => {
      const { userId, post } = (event as CustomEvent<{ userId: string; post: Post }>).detail;
      if (userId === user?.id)
        setPosts((old) =>
          old.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  ...post,
                  feedId: p.feedId,
                  repostedBy: p.repostedBy,
                  repostedAt: p.repostedAt,
                }
              : p,
          ),
        );
    };
    window.addEventListener('post-updated', update);
    return () => window.removeEventListener('post-updated', update);
  }, [user?.id]);
  useEffect(() => {
    if (loadedKey.current === cacheKey && !loading && !error)
      feedCache.set(cacheKey, {
        posts,
        cursor,
        requiresLogin,
        feedAsOf: feedAsOf.current,
        time: Date.now(),
      });
  }, [posts, cursor, requiresLogin, loading, error, cacheKey]);
  if (loading)
    return (
      <div className="skeleton-list" aria-label="Loading posts" role="status">
        {[0, 1, 2].map((i) => (
          <div className="skeleton-post" key={i}>
            <div />
            <section>
              <span />
              <span />
              <span />
            </section>
          </div>
        ))}
      </div>
    );
  return (
    <>
      {live && pendingPosts.length > 0 && (
        <div
          style={{ height: noticeSlot ? 52 : 0 }}
          className={'new-posts-holder ' + (nearTop ? 'new-posts-inline' : 'new-posts-docked')}
        >
          <button
            className="new-posts-button"
            onClick={() => {
              setPendingPosts([]);
              setRetry((n) => n + 1);
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              });
            }}
          >
            <span className="new-post-avatars">
              {[
                ...new Map(
                  pendingPosts.map((p) => [
                    (p.repostedBy ?? p.author).id,
                    p.repostedBy ?? p.author,
                  ]),
                ).values(),
              ]
                .slice(0, 3)
                .map((a) => (
                  <Avatar key={a.id} user={a} />
                ))}
            </span>
            ↑ Show new posts · {pendingPosts.length}
            {pendingPosts.length >= 50 ? '+' : ''}
          </button>
        </div>
      )}
      {error && <ErrorBox message={error} retry={() => setRetry((n) => n + 1)} />}
      <div className="posts">
        {posts.map((post) => (
          <PostCard
            key={post.feedId ?? post.id}
            post={post}
            onDeleted={(id) => setPosts((old) => old.filter((p) => p.id !== id))}
          />
        ))}
      </div>
      {!posts.length && !error && (
        <div className="empty-state">
          <span className="empty-icon">
            <MessageCircle size={28} />
          </span>
          <h2>{emptyTitle}</h2>
          <p>{emptyText}</p>
        </div>
      )}
      {requiresLogin && <JoinPrompt />}
      {cursor && (
        <div className="load-more">
          <button className="button secondary" disabled={loadingMore} onClick={() => void more()}>
            {loadingMore ? 'Loading…' : 'More conversations'}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function UrlText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const link of detectedLinks(text)) {
    parts.push(<EmojiText key={'t' + at} text={text.slice(at, link.start)} />);
    parts.push(
      <a
        key={'l' + link.start}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        title={link.url}
      >
        {link.text.replace(/^https?:\/\//i, '')}
      </a>,
    );
    at = link.end;
  }
  parts.push(<EmojiText key={'t' + at} text={text.slice(at)} />);
  return <>{parts}</>;
}

export function LinkText({ text, tokens = [] }: { text: string; tokens?: TextEntity[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  const urls = detectedLinks(text);
  for (const token of [...tokens].sort((a, b) => a.start - b.start)) {
    if (
      token.start < at ||
      token.end > text.length ||
      text.slice(token.start, token.end) !== token.label ||
      urls.some((url) => url.start < token.end && url.end > token.start)
    )
      continue;
    parts.push(<UrlText key={'text' + at} text={text.slice(at, token.start)} />);
    const href =
      token.kind === 'HASHTAG' && token.hashtag
        ? '/tags/' + encodeURIComponent(token.hashtag)
        : token.kind === 'MENTION' && token.user
          ? '/u/' + token.user.username
          : null;
    parts.push(
      href ? (
        <Link className="text-entity" key={'entity' + token.start} to={href}>
          {token.label}
        </Link>
      ) : (
        token.label
      ),
    );
    at = token.end;
  }
  parts.push(<UrlText key={'tail' + at} text={text.slice(at)} />);
  return <>{parts}</>;
}

export function BioText({ text }: { text: string }) {
  const tokens: TextEntity[] = [];
  for (const m of text.matchAll(
    /(?<![\p{L}\p{N}_@])(@[a-zA-Z0-9_]{3,30}|#[\p{L}\p{N}_]{1,64})(?![\p{L}\p{N}_])/gu,
  )) {
    const label = m[0],
      mention = label.startsWith('@');
    tokens.push({
      start: m.index!,
      end: m.index! + label.length,
      label,
      kind: mention ? 'MENTION' : 'HASHTAG',
      hashtag: mention ? null : label.slice(1).normalize('NFKC').toLowerCase(),
      user: mention ? { id: '', username: label.slice(1).toLowerCase() } : null,
    });
  }
  return <LinkText text={text} tokens={tokens} />;
}
