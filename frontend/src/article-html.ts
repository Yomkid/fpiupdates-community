import DOMPurify from 'dompurify';
export function safeArticleHtml(html:string){return DOMPurify.sanitize(html,{ALLOWED_TAGS:['p','br','h2','h3','strong','em','s','u','blockquote','ul','ol','li','pre','code','hr','a'],ALLOWED_ATTR:['href','target','rel']});}
