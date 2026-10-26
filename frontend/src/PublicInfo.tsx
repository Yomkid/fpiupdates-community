import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { InstallApp } from './PWA';
import { PageHeading } from './FeaturePages';
import { api } from './api';
import { useFeatures } from './Features';
import { useNotifications } from './Notifications';
import { useMessageCounts } from './message-state';
const labels: Record<string, string> = {
  '/home': 'Home',
  '/search': 'Explore',
  '/people': 'Who to follow',
  '/notifications': 'Notifications',
  '/notifications/posts': 'Account updates',
  '/settings': 'Settings',
  '/messages': 'Messages',
  '/bookmarks': 'Bookmarks',
  '/communities': 'Communities',
  '/login': 'Sign in',
  '/register': 'Create your account',
  '/editorial': 'Publishing',
  '/admin': 'Staff tools',
  '/admin/analytics': 'Platform analytics',
  '/ads': 'Advertising drafts',
  '/admin/ads': 'Campaign review',
};
export function PageTitles() {
  const { pathname } = useLocation();
  const { unreadCount } = useNotifications();
  const messages = useMessageCounts();
  const count = unreadCount + messages.unreadCount + messages.requestCount;
  const [page, setPage] = useState({ path: pathname, title: 'FpiUpdates' });
  useEffect(() => {
    let active = true;
    const c = new AbortController();
    if (labels[pathname]) setPage({ path: pathname, title: labels[pathname] + ' / FpiUpdates' });
    else
      api<{ title: string }>('/public/page?path=' + encodeURIComponent(pathname), {
        signal: c.signal,
      })
        .then((p) => {
          if (active) setPage({ path: pathname, title: p.title });
        })
        .catch(() => {});
    return () => {
      active = false;
      c.abort();
    };
  }, [pathname]);
  useEffect(() => {
    document.title =
      (count ? `(${count}) ` : '') + (page.path === pathname ? page.title : 'FpiUpdates');
  }, [pathname, page, count]);
  return null;
}
const content: Record<string, { title: string; intro: string; sections: [string, string][] }> = {
  '/help': {
    title: 'How can we help?',
    intro: 'Common questions about the FpiUpdates beta.',
    sections: [
      [
        'Account access',
        'Use Forgot password on the sign-in page. Verify your email from Settings → Account & security. Never share passwords, verification links or sign-in codes.',
      ],
      [
        'Notifications',
        'In-app alerts appear in Notifications. Background alerts need a supported device, permission and server configuration. On iPhone or iPad, open the installed Home Screen app first.',
      ],
      [
        'Reporting and safety',
        'Use the three-dot menu on a post to report a problem. Block or mute accounts from their post or profile menu. Reports do not guarantee an immediate response. FpiUpdates is not an emergency service.',
      ],
    ],
  },
  '/guidelines': {
    title: 'Community guidelines',
    intro: 'Help make FpiUpdates useful, welcoming and safe.',
    sections: [
      [
        'Respect people',
        'No threats, targeted harassment, hateful abuse, impersonation or sharing private personal information without permission.',
      ],
      [
        'Share responsibly',
        'Do not publish scams, deceptive offers or dangerous content. Distinguish opinion from fact and check sources. Confirm institutional fees and deadlines through official channels.',
      ],
      [
        'Protect the community',
        'Report harmful content rather than amplifying it. Moderators may restrict content or accounts. Context and severity guide moderation; repeated violations may lead to suspension.',
      ],
    ],
  },
  '/privacy': {
    title: 'Privacy and your choices',
    intro:
      'Beta notice: operator contact details, retention periods and a formal data-request process must be completed before public launch.',
    sections: [
      [
        'Public content',
        'Your username, display name, bio, occupation, skills, public posts and profile media may be visible to visitors and search engines. Gender, date of birth, email and phone are not included in your public profile response.',
      ],
      [
        'Account and delivery data',
        'Credentials, sessions, reports and notification subscriptions support sign-in, safety and delivery. Push-service providers receive delivery requests. Lock-screen push alerts use a generic activity summary. Signing out stops that session’s push delivery.',
      ],
      [
        'Measurement',
        'Audience measurement has an opt-out in platform statistics and respects supported browser privacy signals. Installation measurement uses a random browser identifier and platform category. It cannot detect every physical device or reliably detect uninstalls.',
      ],
      [
        'Your controls',
        'Use Settings for profile, discoverability, blocked/muted accounts and notifications. Bookmark totals do not reveal who bookmarked a post. Private messages and staff pages are excluded from public preview metadata.',
      ],
      [
        'Before launch',
        'The final notice must identify the responsible operator and contact route, processing purposes and legal bases, retention periods, service providers and practical access, correction and deletion procedures. This beta notice does not replace those arrangements.',
      ],
    ],
  },
  '/terms': {
    title: 'Beta terms',
    intro:
      'FpiUpdates is an independent community platform. These beta conditions need completed operator/contact details and review before public launch.',
    sections: [
      [
        'Participation',
        'Use accurate account information, protect your login and follow community guidelines. Do not impersonate an institution or another person. Features may change during testing.',
      ],
      [
        'Your content',
        'Only publish content you have the right to share. You remain responsible for your posts. Public content may be copied by other people and sharing services.',
      ],
      [
        'Independent information',
        'FpiUpdates is not an official school portal. Verify admissions, payment instructions and deadlines through official sources.',
      ],
      [
        'Advertising',
        'Purchases are not open yet. Saving a campaign draft does not create a charge. Final pricing, delivery, billing and refund terms must be available before purchases are enabled.',
      ],
    ],
  },
  '/advertise': {
    title: 'Reach your community',
    intro:
      'Advertising purchases are not open yet. Sponsored posts are planned for relevant businesses, opportunities and events.',
    sections: [
      [
        'The planned experience',
        'Create an ad or choose an eligible post, select placement, dates and a maximum budget, then submit it for review. Payment integration and terms must be ready before purchases open.',
      ],
      [
        'Clear labelling',
        'Approved ads will say Sponsored. Initial placements will focus on the feed and relevant communities, with limits on repeated exposure.',
      ],
      [
        'Meaningful results',
        'Reporting will distinguish impressions, reach, clicks and engagements. Budgets cap spending; they do not guarantee sales or responses.',
      ],
      [
        'Safety',
        'Ads require moderation and cannot bypass community rules. Private profile details will not be offered as advertising audiences.',
      ],
    ],
  },
};
export function PublicInfoPage() {
  const { pathname } = useLocation();
  const { flags } = useFeatures();
  if (pathname === '/install')
    return (
      <>
        <PageHeading title="Take FpiUpdates with you" subtitle="Your community, one tap away." />
        <article className="public-info">
          <InstallApp details />
          <h2>Android</h2>
          <p>
            Tap Install FpiUpdates when available. Otherwise, open your browser menu and choose
            Install app or Add to Home screen.
          </p>
          <h2>iPhone and iPad</h2>
          <p>
            Open FpiUpdates in Safari, tap Share, then Add to Home Screen. If shown, keep Open as
            Web App enabled. Launch it from the new icon. For background alerts, open Settings →
            Notifications inside the installed app.
          </p>
          <h2>Desktop</h2>
          <p>
            Use the installation icon near your browser’s address bar or its Install app menu.
            Availability depends on your browser.
          </p>
          <h2>Already installed elsewhere?</h2>
          <p>
            Open the icon you already installed. A different browser may not detect it. Automatic
            opening in the installed app is not available from every browser.
          </p>
          <Link to="/settings#notifications">Notification settings →</Link>
        </article>
      </>
    );
  const p = content[pathname] ?? content['/help'];
  return (
    <>
      <PageHeading title={p.title} />
      <article className="public-info">
        <p className="public-intro">{p.intro}</p>
        {pathname === '/advertise' && flags.advertising && (
          <Link className="button primary" to="/ads">
            Open campaign drafts
          </Link>
        )}
        {p.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        <nav aria-label="Useful information">
          {['about', 'help', 'install', 'guidelines', 'privacy', 'terms', 'advertise'].map((x) => (
            <Link key={x} to={'/' + x}>
              {x === 'install' ? 'Install app' : x[0].toUpperCase() + x.slice(1)}
            </Link>
          ))}
        </nav>
      </article>
    </>
  );
}
