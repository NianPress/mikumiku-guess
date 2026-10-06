(()=>{
 const key='chu-yiba:theme',valid=value=>['system','dark','light'].includes(value)?value:'system';
 let mode='system';try{mode=valid(localStorage.getItem(key));}catch{}
 const media=matchMedia('(prefers-color-scheme: dark)');
 function apply(){const theme=mode==='system'?(media.matches?'dark':'light'):mode;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#10181c':'#f3f7f6');}
 window.ChuTheme={get:()=>mode,set:value=>{mode=valid(value);try{localStorage.setItem(key,mode);}catch{}apply();}};
 media.addEventListener('change',apply);apply();
})();
