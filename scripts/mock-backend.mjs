import { createHash } from 'node:crypto';
export function mockBackend(origin) {
  const user = { sub:'fixture-owner', email:'fixture@example.invalid', name:'Native fixture' };
  const route = (id,name,url,order) => ({id,userId:user.sub,name,url,icon:'link',order,metadata:{openExternalLinksInBrowser:true},createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'});
  const state = { offline:false, invalid:false, holdAuthorization:false, refreshes:0, requests:[], routes:[route('fixture-a','Fixture A',origin+'/',0),route('fixture-b','Fixture B',origin+'/',1)], next:0, code:null };
  const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const body=async req=>{let b='';for await(const c of req)b+=c;return b;};
  async function handle(req,res){
    const u=new URL(req.url,origin);
    if(u.pathname==='/discovery'){if(state.discoveryDelay) await new Promise(resolve=>setTimeout(resolve,state.discoveryDelay));json(res,{authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',userinfo_endpoint:origin+'/userinfo'});return true;}
    if(u.pathname==='/authorize'){
      state.code={state:u.searchParams.get('state'),challenge:u.searchParams.get('code_challenge')};
      const callback='omnia://auth/callback?code=fixture-code&state='+encodeURIComponent(state.code.state);
      res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Mock OIDC</title>'+(state.holdAuthorization?'Waiting for cold callback':'<script>location.href='+JSON.stringify(callback)+'</script>'));return true;
    }
    if(u.pathname==='/token'){
      const p=new URLSearchParams(await body(req));state.requests.push({path:u.pathname,grant:p.get('grant_type')});
      if(p.get('grant_type')==='authorization_code'){
        const challenge=createHash('sha256').update(p.get('code_verifier')||'').digest('base64url');
        if(!state.code||p.get('code')!=='fixture-code'||challenge!==state.code.challenge||p.get('redirect_uri')!=='omnia://auth/callback'){json(res,{error:'invalid_grant'},400);return true;}
        state.code=null;
      }else{state.refreshes++;if(p.get('refresh_token')!=='fixture-refresh'){json(res,{error:'invalid_grant'},400);return true;}}
      json(res,{access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'Bearer',expires_in:3600});return true;
    }
    if(u.pathname==='/userinfo'){json(res,user,state.invalid?401:200);return true;}
    if(!u.pathname.startsWith('/routes'))return false;
    state.requests.push({path:u.pathname,method:req.method});
    if(req.headers.authorization!=='Bearer fixture-access'||state.invalid){json(res,{error:'unauthorized'},401);return true;}
    if(state.offline){json(res,{error:'temporary outage'},503);return true;}
    if(u.pathname==='/routes'&&req.method==='GET'){json(res,{routes:state.routes});return true;}
    if(u.pathname==='/routes'&&req.method==='POST'){
      const value=JSON.parse(await body(req));const r={...route('created-'+(++state.next),value.name,value.url,value.order),icon:value.icon,metadata:value.metadata};state.routes.push(r);json(res,{route:r},201);return true;
    }
    const id=decodeURIComponent(u.pathname.slice('/routes/'.length));const r=state.routes.find(r=>r.id===id);
    if(!r){json(res,{error:'not found'},404);return true;}
    if(req.method==='PATCH'){if(state.failPatchId===id){json(res,{error:'fixture partial mutation failure'},503);return true;}Object.assign(r,JSON.parse(await body(req)));json(res,{route:r});return true;}
    if(req.method==='DELETE'){state.routes=state.routes.filter(r=>r.id!==id);res.writeHead(204).end();return true;}
    json(res,{error:'method'},405);return true;
  }
  return {state,handle};
}
