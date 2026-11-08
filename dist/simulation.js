'use strict';
const PopulationModel = (() => {
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const forecast=(school,year)=>school.forecast[year-2026];
  const total=(grades,special)=>Math.floor(sum(grades)+special+.5);
  function effects(state){
    // Game assumptions. These coefficients are not measured policy effects.
    return {
      admission:clamp(state.appeal*.008+(state.rep-50)*.001+(state.happy-60)*.0008+(state.teacher-60)*.0005+(state.facilities-50)*.0004,-.25,.35),
      transfer:clamp(state.appeal*.0004+(state.rep-50)*.00003+(state.happy-60)*.00004+(state.teacher-60)*.00003+(state.facilities-50)*.00002,-.015,.015)
    };
  }
  function transition(previousGrades,previousBaseline,nextBaseline,policy){
    if(nextBaseline.closed)return nextBaseline.grades.map(()=>0);
    const baseTotal=sum(nextBaseline.grades);
    // A game policy may recruit from the regional catchment even when the
    // no-additional-policy reference has zero intake. This is a game assumption,
    // separate from the baseline; neutral policy never creates these entrants.
    const recruitment=Number.isFinite(nextBaseline.gameRecruitmentPotential)?Math.max(0,nextBaseline.gameRecruitmentPotential):0;
    const next=nextBaseline.grades.map((value,i)=>{
      if(i===0)return Math.max(0,value*(1+policy.admission)+(value===0?recruitment*Math.max(0,policy.admission):0));
      const prior=previousBaseline.grades[i-1];
      const retention=prior>0&&value>0?value/prior:(nextBaseline.gameRetention||1);
      const inherited=(previousGrades[i-1]-prior)*retention;
      const transfer=value*policy.transfer;
      return Math.max(0,value+inherited+transfer);
    });
    // A school cannot indefinitely multiply a shrinking catchment through choices.
    const capacity=Math.max(baseTotal,recruitment*6);
    const nextTotal=sum(next);
    return nextTotal>capacity*1.6&&nextTotal>0?next.map(v=>v*capacity*1.6/nextTotal):next;
  }
  return {forecast,total,effects,transition};
})();
if(typeof module!=='undefined')module.exports=PopulationModel;
