/* Direct feature bootstrap: makes the feature scripts load even when Worker HTML injection is bypassed. */
(()=>{
  const load=(src)=>{if(document.querySelector('script[data-morgdoni-src="'+src+'"]'))return;const s=document.createElement('script');s.src=src;s.async=false;s.dataset.morgdoniSrc=src;document.head.appendChild(s)};
  const go=()=>{load('/quick-game-ui.js?v=direct2');load('/mega-features.js?v=direct2')};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go,{once:true});else go();
})();
