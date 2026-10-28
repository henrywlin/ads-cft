const level=new URLSearchParams(location.search).get('level')==='2'?2:1;
const select=document.getElementById('levelSelect');select.value=String(level);
select.onchange=()=>{const url=new URL(location.href);url.searchParams.set('level',select.value);url.searchParams.set('v','36');location.assign(url)};
const link=document.createElement('a');link.className='level-return';link.textContent=level===2?'LEVEL 2 · BLACK HOLE':'LEVEL 1 · AdS';link.href='./?v=36';link.title='Return to launch and select a level';document.querySelector('.header-description').after(link);
try{await import(level===2?'./black-hole-game.js?v=36':'./game.js?v=35')}catch(error){console.error(error);for(const id of ['launchGraphicsStatus','graphicsStatus']){const status=document.getElementById(id);status.hidden=false;status.querySelector('p').textContent='The game could not start. Reload to retry.';status.querySelector('button').hidden=false;status.querySelector('button').onclick=()=>location.reload()}}
