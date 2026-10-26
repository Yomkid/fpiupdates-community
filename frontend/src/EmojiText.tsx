import { useState, type ReactNode } from 'react';
import emojiRegex from 'emoji-regex';
import available from './emoji-assets.json';
const assets = new Set(available);
function EmojiImage({ text, icon }: { text: string; icon: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <>{text}</>
  ) : (
    <img
      className="platform-emoji"
      src={'/emoji/svg/' + icon + '.svg'}
      alt={text}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function EmojiText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(emojiRegex())) {
    if (match.index > at) nodes.push(text.slice(at, match.index));
    const icon = Array.from(
      match[0].includes('\u200d') ? match[0] : match[0].replace(/\ufe0f/g, ''),
    )
      .map((c) => c.codePointAt(0)!.toString(16))
      .join('-');
    const asset = assets.has(icon) ? icon : icon.replace(/-fe0f/g, '');
    nodes.push(
      assets.has(asset) ? (
        <EmojiImage key={match.index + match[0]} text={match[0]} icon={asset} />
      ) : (
        match[0]
      ),
    );
    at = match.index + match[0].length;
  }
  nodes.push(text.slice(at));
  return <>{nodes}</>;
}
