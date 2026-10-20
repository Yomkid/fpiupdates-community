/** Transparent artwork: only the outer arrows rotate. */
export function BrandMark({large=false}:{large?:boolean}){
 return <span className={'brand-logo'+(large?' brand-logo-hero':'')} aria-hidden="true"><img className="logo-ring" src="/brand-logo-color.webp" alt=""/><img className="logo-center" src="/brand-logo-color.webp" alt=""/></span>;
}
