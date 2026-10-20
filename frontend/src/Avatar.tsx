import {mediaUrl,type User} from './api';
export function Avatar({ user, large = false }: { user: Pick<User, 'displayName' | 'username' | 'avatarMediaId'>; large?: boolean }) {
  const hue = [...user.username].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5;
  if(user.avatarMediaId)return <span aria-hidden="true" className={`avatar photo-avatar ${large?'large':''}`}><img src={mediaUrl(user.avatarMediaId)} alt=""/></span>;
  return <span aria-hidden="true" className={`avatar tone-${hue} ${large ? 'large' : ''}`}>{user.displayName.trim().split(/\s+/).slice(0,2).map(s => s[0]).join('').toUpperCase()}</span>;
}
