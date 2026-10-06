const value=process.env.CLOUDFLARE_DEPLOY_HOOK;
if(!value) throw Error('请在 GitHub Secrets 中配置 CLOUDFLARE_DEPLOY_HOOK');
const target=new URL(value);
if(target.protocol!=='https:' || target.hostname!=='api.cloudflare.com' || target.username || target.password) throw Error('部署触发链接格式不正确');
try {
  const response=await fetch(target,{method:'POST',signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Error('HTTP '+response.status);
  console.log('Cloudflare build requested. Check Cloudflare Builds for deployment status.');
} catch { throw Error('Cloudflare 部署触发失败，请检查构建记录；新快照已保存在仓库中'); }
