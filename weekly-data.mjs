import assert from 'node:assert/strict';
export function applyWeekly(library,data){
 const coverage=data.coverage;
 assert.equal(coverage.completeThroughLatestPublished,true);
 assert.equal(coverage.missingPeriods.length,0);
 assert.equal(coverage.conflictPeriods.length,0);
 const byVideo=new Map();
 for(const row of data.records){const rows=byVideo.get(row.nicoId)||[];rows.push(row);byVideo.set(row.nicoId,rows);}
 const idsFor=s=>[...new Set([s.videos.niconico?.id,...(s.audit?.alternateOriginalVideos?.niconico||[]).map(u=>u.match(/\/(sm\d+|nm\d+|so\d+)/)?.[1])].filter(Boolean))];
 for(const s of library.songs){
  const ids=idsFor(s),rows=ids.flatMap(id=>byVideo.get(id)||[]),episodes=new Map();
  for(const r of rows)if(!episodes.has(r.episode)||r.rank<episodes.get(r.episode).rank)episodes.set(r.episode,r);
  const history=[...episodes.values()].sort((a,b)=>a.episode-b.episode).map(r=>({episode:r.episode,rank:r.rank,source:r.sourceUrl,verificationStatus:r.rowVerificationStatus||r.verificationStatus}));
  const weeks=history.length,peak=weeks?Math.min(...history.map(r=>r.rank)):null;
  s.rankings.weekly={status:ids.length?'complete':'unavailable',weeks:ids.length?weeks:null,peak:ids.length?peak:null,knownWeeks:weeks,knownPeak:peak,fromEpisode:coverage.fromEpisode,throughEpisode:coverage.toEpisode,source:history[0]?.source||library.charts.weekly.source,history,matchedOriginalIds:ids,reason:ids.length?null:'original_unconfirmed',verificationLevels:[...new Set(history.map(r=>r.verificationStatus))],coverageStatus:'complete_published_range'};
 }
 library.charts.weekly={...library.charts.weekly,status:'complete',fromEpisode:coverage.fromEpisode,throughEpisode:coverage.toEpisode,records:data.records.length,pendingPeriods:0,completePeriods:coverage.completePeriods,singleSourcePeriods:coverage.remainingSingleSourcePeriods,sourceVerification:coverage.statusCounts,scope:coverage.includes,latestEvidenceUrl:data.latestPublished.sourceUrl,latestPublishedAt:data.latestPublished.postedAt,statisticsThrough:data.latestPublished.statisticsEnd,latestCheckedAt:data.latestPublished.checkedAt,publicationStatus:data.latestPublished.status,publicationNote:'截至 '+data.latestPublished.checkedAt+'，最新正式发布为第 '+coverage.toEpisode+' 期，作者暂未发布后续期数。末尾 13 期采用完整百科记录，来源等级单独保留。'};
 return library;
}
