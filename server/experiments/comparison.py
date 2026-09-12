import json
from pathlib import Path
import numpy as np
from scipy.stats import bootstrap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

data=json.loads(next(Path('inputs').glob('*-input.json')).read_text())
request=data['request']; pairs=data['pairs']; metric=data['metric']
a=np.array([p['baseline']['value'] for p in pairs]); b=np.array([p['comparison']['value'] for p in pairs])
d=b-a
if not np.isfinite(d).all(): raise ValueError('Paired differences overflowed; rescale the metric.')
# Scaling keeps finite large observations from overflowing a mean or standard deviation.
scale=max(float(np.max(np.abs(d))),1e-300)
normalized=d/scale
mean=float(np.mean(normalized)*scale)
spread=float(np.std(normalized,ddof=1)*scale) if len(d)>1 else None
if not np.isfinite(mean) or (spread is not None and not np.isfinite(spread)): raise ValueError('Summary overflowed; rescale the metric.')
interval=None
warnings=['Exploratory, single-contrast analysis chosen after the study. No multiple-comparison adjustment. Repeated computations are not independent physical observations.']
if request['sampling']=='deterministic':
    warnings.append('Deterministic repeats: no sampling confidence interval is estimated.')
elif len(d)<6:
    warnings.append('Fewer than six paired repeats: uncertainty interval withheld; more independent simulation seeds are needed.')
elif np.ptp(normalized)==0:
    warnings.append('All observed paired differences are identical: uncertainty interval withheld; this does not imply zero uncertainty.')
else:
    result=bootstrap((normalized,),np.mean,method='BCa',confidence_level=request['confidence'],n_resamples=9999,batch=512,rng=np.random.default_rng(request['seed']))
    bounds=np.array([result.confidence_interval.low,result.confidence_interval.high])*scale
    if np.isfinite(bounds).all(): interval=bounds.tolist()
    else: warnings.append('Bootstrap interval is degenerate; inspect the raw paired differences.')
    warnings.append('Small-sample bootstrap interval is exploratory and assumes independent repeat seeds with valid pairing; coverage is not guaranteed.')
failed=sum(p[k]['status']=='failed' for p in pairs for k in ['baseline','comparison'])
if failed: warnings.append(f'{failed} outcomes failed study checks and remain included to avoid success-only selection.')
summary={'metric':metric['name'],'unit':metric['unit'],'pairs':len(pairs),'direction':'comparison minus baseline','meanDifference':mean,'sampleSD':spread,'confidence':request['confidence'],'interval':interval,'method':'BCa paired-difference bootstrap' if interval is not None else 'descriptive only','failedChecksIncluded':failed,'warnings':warnings,'observations':pairs}
Path('artifacts/comparison.json').write_text(json.dumps(summary,indent=2,allow_nan=False))
def cell(value): return str(value).replace('|','\\|').replace('\n',' ').replace('<','&lt;')
rows='\n'.join(f"| {p['repeat']} | {p['seed']} | {p['baseline']['value']:.7g} | {p['comparison']['value']:.7g} | {delta:.7g} | {p['baseline']['status']} / {p['comparison']['status']} |" for p,delta in zip(pairs,d))
ci=f"{request['confidence']*100:g}% BCa interval: [{interval[0]:.7g}, {interval[1]:.7g}]." if interval else 'No sampling interval reported.'
report=f"""# Paired comparison: {cell(metric['name'])}

{cell(data['studyTitle'])}

Baseline: {cell(data['baselineParameters'])}. Comparison: {cell(data['comparisonParameters'])}.

**Mean difference: {mean:.7g} {cell(metric['unit'])}**, comparison minus baseline. {ci}

Analysis rationale: {cell(request['rationale'])}

| Repeat | Seed | Baseline | Comparison | Difference | Study checks |
| --- | --- | ---: | ---: | ---: | --- |
{rows}

## Interpretation boundaries

"""+'\n'.join('- '+cell(w) for w in warnings)
Path('artifacts/comparison.md').write_text(report)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,ax=plt.subplots(figsize=(8,4.5),layout='constrained',facecolor='white')
colors=['#a5362e' if any(p[k]['status']=='failed' for k in ['baseline','comparison']) else '#315c45' for p in pairs]
ax.axhline(0,color='#acb5ae',linewidth=1,linestyle='--')
ax.scatter(range(1,len(d)+1),d,c=colors,s=45,zorder=3)
ax.axhline(mean,color='#315c45',linewidth=1,label='Mean paired difference')
if interval: ax.axhspan(*interval,color='#315c45',alpha=.10,label=f"{request['confidence']*100:g}% BCa interval for mean")
ax.set(xlabel='Paired repeat',ylabel=f"Difference ({metric['unit']})",title=f"{metric['name']}: comparison minus baseline",xticks=range(1,len(d)+1))
ax.grid(axis='y',alpha=.15); ax.legend(frameon=False,fontsize=8)
fig.savefig('artifacts/comparison.png',dpi=150);plt.close(fig)
print(json.dumps({k:v for k,v in summary.items() if k!='observations'},allow_nan=False))
