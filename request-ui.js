(()=>{
const sock=()=>window.__MORG_SOCKET__;
let tries=0;
function hook(){
 const s=sock();
 if(!s){if(tries++<100)setTimeout(hook,200);return;}
 s.on('gameRejected',d=>alert('درخواست رد شد توسط '+(d?.byName||'بازیکن')));
 s.on('gameRequestError',d=>alert(d||'ارسال درخواست ممکن نشد'));
 s.on('gameError',d=>alert(d||'خطای بازی'));
}
hook();
})();
